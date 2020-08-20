import * as path from 'path';
import * as core from '@actions/core';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson, getAllJsonFilesPath } from '../utils/fileHelper';
import { getObjectHash } from '../utils/hashUtils'
import { getWorkflowRunUrl, prettyLog, prettyDebugLog } from '../utils/utilities'

export const DEFINITION_TYPE = "definition";
export const ASSIGNMENT_TYPE = "assignment";
export const POLICY_OPERATION_CREATE = "CREATE";
export const POLICY_OPERATION_UPDATE = "UPDATE";
export const POLICY_OPERATION_NONE = "NONE";
export const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
const POLICY_DEFINITION_NOT_FOUND = "PolicyDefinitionNotFound";
const POLICY_ASSIGNMENT_NOT_FOUND = "PolicyAssignmentNotFound";
const POLICY_METADATA_GITHUB_KEY = "gitHubPolicy";
const POLICY_METADATA_HASH_KEY = "policyHash";

export interface PolicyRequest {
  path: string;
  type: string;
  operation: string;
}

interface PolicyDetails {
  policy: any;
  path: string;
}

export interface PolicyResult {
  path: string;
  type: string;
  operation: string;
  name: string;
  status: string;
  message: string;
}

export interface PolicyMetadata {
  commitSha: string;
  policyHash: string;
  repo: string;
  runUrl: string;
}

export async function getAllPolicyRequests(paths: string[]): Promise<PolicyRequest[]> {
  let policyRequests: PolicyRequest[] = [];
  let currentHash: string;
  let operationType: string;
  let gitPolicy: any;
  let azurePolicy: any;

  try {
    // Get all policy definition, assignment objects
    const allPolicyDetails: PolicyDetails[] = getAllPolicyDetails(paths);

    for (const policyDetails of allPolicyDetails) {
      gitPolicy = policyDetails.policy;
      currentHash = getObjectHash(gitPolicy);
      azurePolicy = await getAzurePolicy(gitPolicy);

      if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND) {
        // There was some error while fetching the policy.
        prettyLog(`Failed to get policy with id ${gitPolicy.id}, path ${policyDetails.path}. Error : ${JSON.stringify(azurePolicy.error)}`);
      }
      else {
        operationType = getPolicyOperationType(policyDetails, azurePolicy, currentHash);
        if (operationType == POLICY_OPERATION_CREATE || operationType == POLICY_OPERATION_UPDATE) {
          policyRequests.push(getPolicyRequest(policyDetails, currentHash, operationType));
        }
      }
    }    
  }
  catch(error) {
    return Promise.reject(error);
  }

  return Promise.resolve(policyRequests);
}

export async function createUpdatePolicies(policyRequests: PolicyRequest[]): Promise<PolicyResult[]> {
  const azHttpClient = new AzHttpClient();
  await azHttpClient.initialize();
  
  let policyResults: PolicyResult[] = [];

  // Dividing policy requests into definitions and assignments.
  const definitionRequests: PolicyRequest[] = policyRequests.filter(req => req.policy.type == DEFINITION_TYPE);
  const assignmentRequests: PolicyRequest[] = policyRequests.filter(req => req.policy.type == ASSIGNMENT_TYPE);

  // Processing definitions first to maintain logical ordering
  for (const definitionRequest of definitionRequests) {
    policyResults.push(await upsertPolicyDefinition(azHttpClient, definitionRequest));
  }

  for (const assignmentRequest of assignmentRequests) {
    policyResults.push(await upsertPolicyAssignment(azHttpClient, assignmentRequest));
  }

  return Promise.resolve(policyResults);
}

function getPolicyDefinition(definitionPath: string): any {
  const policyPath = path.join(definitionPath, POLICY_FILE_NAME);
  const policyRulesPath = path.join(definitionPath, POLICY_RULES_FILE_NAME);
  const policyParametersPath = path.join(definitionPath, POLICY_PARAMETERS_FILE_NAME);

  let definition = getFileJson(policyPath);

  if ((!definition.properties || !definition.properties.policyRule) && doesFileExist(policyRulesPath)) {
    const policyRuleJson = getFileJson(policyRulesPath);
    if (policyRuleJson && policyRuleJson.policyRule) {
      if (!definition.properties) {
        // If properties is missing from the definition object and we obtain policyRule from the
        // policy rules file, add properties.
        definition.properties = {};
      }

      definition.properties.policyRule = policyRuleJson.policyRule;
    }
  }

  if ((!definition.properties || !definition.properties.parameters) && doesFileExist(policyParametersPath)) {
    const policyParametersJson = getFileJson(policyParametersPath);
    if (policyParametersJson && policyParametersJson.parameters) {
      if (!definition.properties) {
        // If properties is missing from the definition object and we obtain parameters from the
        // policy parameters file, add properties.
        definition.properties = {};
      }

      definition.properties.parameters = policyParametersJson.parameters;
    }
  }

  return definition;
}

function getPolicyAssignment(assignmentPath: string): any {
  return getFileJson(assignmentPath);
}

async function upsertPolicyDefinition(azHttpClient: AzHttpClient, policyRequest: PolicyRequest): Promise<PolicyResult> {
  let policyResult: PolicyResult = {
    path: policyRequest.path,
    type: policyRequest.type,
    operation: policyRequest.operation,
    name: '',
    status: '',
    message: ''
  };

  const isCreate: boolean = isCreateOperation(policyRequest);

  try {
    const definition: any = getPolicyDefinition(policyRequest.path);
    validateDefinition(definition);
    policyResult.name = definition.name;
    await azHttpClient.createOrUpdatePolicyDefinition(definition);
    policyResult.status = POLICY_RESULT_SUCCEEDED;
    policyResult.message = `Policy definition ${isCreate ? 'created' : 'updated'} successfully`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }
  catch (error) {
    policyResult.status = POLICY_RESULT_FAILED;
    policyResult.message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy defition. Error: ${error}`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }

  return policyResult;
}

async function upsertPolicyAssignment(azHttpClient: AzHttpClient, policyRequest: PolicyRequest): Promise<PolicyResult> {
  let policyResult: PolicyResult = {
    path: policyRequest.path,
    type: policyRequest.type,
    operation: policyRequest.operation,
    name: '',
    status: '',
    message: ''
  };

  const isCreate: boolean = isCreateOperation(policyRequest);

  try {
    const assignment: any = getPolicyAssignment(policyRequest.path);
    validateAssignment(assignment);
    policyResult.name = assignment.name;
    await azHttpClient.createOrUpdatePolicyAssignment(assignment);
    policyResult.status = POLICY_RESULT_SUCCEEDED;
    policyResult.message = `Policy assignment ${isCreate ? 'created' : 'updated'} successfully`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }
  catch (error) {
    policyResult.status = POLICY_RESULT_FAILED;
    policyResult.message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy assignment. Error: ${error}`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }

  return policyResult;
}

function isCreateOperation(policyRequest: PolicyRequest): boolean {
  return policyRequest.operation == POLICY_OPERATION_CREATE;
}

function validateDefinition(definition: any): void {
  if (!definition.id) {
    throw Error('Property id is missing from the policy definition. Please add id to the policy.json file.');
  }

  if (!definition.name) {
    throw Error('Property name is missing from the policy definition. Please add name to the policy.json file.');
  }
}

function validateAssignment(assignment: any): void {
  if (!assignment.id) {
    throw Error('Property id is missing from the policy assignment. Please add id to the assignment file.');
  }

  if (!assignment.name) {
    throw Error('Property name is missing from the policy assignment. Please add name to the assignment file.');
  }
}

// Returns all policy definition, assgnments present in the given paths.
function getAllPolicyDetails(paths: string[]): PolicyDetails[] {
  let policies: PolicyDetails[] = [];
  let policy: any;

  const jsonPaths: string[] = getAllJsonFilesPath(paths);

  jsonPaths.forEach((path) => {
    policy = getPolicyObject(path);
    if (policy) {
      policies.push({
        path: path,
        policy: policy
      } as PolicyDetails);
    }
  });

  return policies;
}

function getPolicyObject(path: string): any {
  let jsonObj = getFileJson(path);

  // Todo : For DEFINITION_TYPE we need to check for parameter and rules files if required.
  // TODO : basic validation

  if (jsonObj.type && jsonObj.type == ASSIGNMENT_TYPE || jsonObj.type == DEFINITION_TYPE) {
    return jsonObj;
  }

  return undefined;
}

function getWorkflowMetadata(policyHash: string): PolicyMetadata {
  let metadata: PolicyMetadata = {
    policyHash: policyHash,
    repo: process.env.GITHUB_REPOSITORY,
    commitSha: process.env.GITHUB_SHA,
    runUrl: getWorkflowRunUrl()
  }

  return metadata;
}

function getPolicyRequest(policyDetails: PolicyDetails, hash: string, operation: string): PolicyRequest {
  let metadata = getWorkflowMetadata(hash);

  if (!policyDetails.policy.properties) {
    policyDetails.policy.properties = {};
  }

  if (!policyDetails.policy.properties.metadata) {
    policyDetails.policy.properties.metadata = {};
  }

  policyDetails.policy.properties.metadata[POLICY_METADATA_GITHUB_KEY] = metadata;

  let policyRequest: PolicyRequest = {
    policy: policyDetails.policy,
    path: policyDetails.path,
    operation: operation
  }
  return policyRequest;
}

// This is a temp function. We will need to remove this wile optimising azure calls.
async function getAzurePolicy(policy: any): Promise<any> {
  const azHttpClient = new AzHttpClient();
  await azHttpClient.initialize();

  if (policy.type == DEFINITION_TYPE) {
    return azHttpClient.getPolicyDefinition(policy);
  }
  else {
    return azHttpClient.getPolicyAssignment(policy);
  }
}

function getPolicyOperationType(gitPolicyDetails: PolicyDetails, azurePolicy: any, currentHash: string): string {
  if (azurePolicy.error) {
    prettyDebugLog(`Policy with id : ${gitPolicyDetails.policy.id}, path : ${gitPolicyDetails.path} does not exist in azure. A new policy will be created.`);
    return POLICY_OPERATION_CREATE;
  }

  if (!azurePolicy.properties) {
    return POLICY_OPERATION_UPDATE;
  }

  let azureMetadata = azurePolicy.properties.metadata;

  if (azureMetadata[POLICY_METADATA_GITHUB_KEY]) {
    let azureHash = azureMetadata[POLICY_METADATA_GITHUB_KEY][POLICY_METADATA_HASH_KEY];
    if (azureHash == currentHash) {
      prettyDebugLog(`Hash is same for policy id : ${gitPolicyDetails.policy.id}`);
      return POLICY_OPERATION_NONE;
    }
    else {
      prettyDebugLog(`Hash is not same for policy id : ${gitPolicyDetails.policy.id}`);
      return POLICY_OPERATION_UPDATE;
    }
  }
  else {
    prettyDebugLog(`GitHub metaData is not present for policy id : ${gitPolicyDetails.policy.id}`);
    return POLICY_OPERATION_UPDATE;
  }
}