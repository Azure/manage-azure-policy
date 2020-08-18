import * as path from 'path';
import * as core from '@actions/core';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson } from '../utils/fileHelper';

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
  commit_sha: string;
  policy_hash: string;
  repo: string;
  run_url: string;
}

export async function getAllPolicyRequests(paths: string[]): Promise<PolicyRequest[]> {
  let policyRequests: PolicyRequest[] = [];
  let currentHash: string;
  let eventType: string;
  let gitPolicy: any;
  let azurePolicy: any;

  try {
    // Get all policy definition, assignment objects
    let allPolicyDetails: PolicyDetails[] = getAllPolicyDetails(paths);

    for (let policyDetails of allPolicyDetails) {
      gitPolicy = policyDetails.policy;
      currentHash = getObjectHash(gitPolicy);
      azurePolicy = await getAzurePolicy(gitPolicy);

      if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND) {
        // There was some error while fetching the policy.
        printPartitionedText(`Failed to get policy with id ${gitPolicy.id}, path ${policyDetails.path}. Error : ${JSON.stringify(azurePolicy.error)}`);
        continue;
      }

      eventType = getPolicyEventType(policyDetails, azurePolicy, currentHash);

      if (eventType == POLICY_OPERATION_CREATE || eventType == POLICY_OPERATION_UPDATE) {
        policyRequests.push(getPolicyRequest(policyDetails, currentHash, eventType));
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
  for (const policyRequest of policyRequests) {
    switch (policyRequest.type) {
      case DEFINITION_TYPE:
        policyResults.push(await upsertPolicyDefinition(azHttpClient, policyRequest));
        break;

      case ASSIGNMENT_TYPE:
        policyResults.push(await upsertPolicyAssignment(azHttpClient, policyRequest));
        break;
    }
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

  let jsonPaths: string[] = getAllJsonFilesPath(paths);

  jsonPaths.forEach((path) => {
    let policy = getPolicyObject(path);
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
    policy_hash: policyHash,
    repo: process.env.GITHUB_REPOSITORY,
    commit_sha: process.env.GITHUB_SHA,
    run_url: getWorkflowRunUrl()
  }

  return metadata;
}

function getPolicyRequest(policyReq: PolicyDetails, hash: string, eventType: string): PolicyRequest {
  let metadata = getWorkflowMetadata(hash);
  if (!policyReq.policy.properties.metadata) {
    policyReq.policy.properties.metadata = {};
  }

  policyReq.policy.properties.metadata[POLICY_METADATA_GITHUB_FILED] = metadata;

  let policyRequest: PolicyRequest = {
    policy: policyReq.policy,
    path: policyReq.path,
    operation: eventType
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

function getPolicyEventType(gitPolicyDetails: PolicyDetails, azurePolicy: any, currentHash: string): string {
  if (azurePolicy.error) {
    printPartitionedText(`Policy with id : ${gitPolicyDetails.policy.id}, path : ${gitPolicyDetails.path} does not exist in azure. A new policy will be created.`);
    return POLICY_OPERATION_CREATE;
  }

  let azureMetadata = azurePolicy.properties.metadata;

  if (azureMetadata[POLICY_METADATA_GITHUB_FILED]) {
    let azureHash = azureMetadata[POLICY_METADATA_GITHUB_FILED][POLICY_METADATA_HASH_FIELD];
    if (azureHash == currentHash) {
      printPartitionedText(`Hash is same for policy id : ${gitPolicyDetails.policy.id}`);
      return POLICY_OPERATION_NONE;
    }
    else {
      console.log("Hash is not same. We need to update.");
      return POLICY_OPERATION_UPDATE;
    }
  }
  else {
    printPartitionedText("Github metaData is not present. Will need to update");
    return POLICY_OPERATION_UPDATE;
  }
}