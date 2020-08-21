import * as path from 'path';
import * as core from '@actions/core';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson, getAllJsonFilesPath } from '../utils/fileHelper';
import { getObjectHash } from '../utils/hashUtils';
import { getWorkflowRunUrl, prettyLog, prettyDebugLog } from '../utils/utilities';
import { getAllPolicyAssignmentPaths, getAllPolicyDefinitionPaths } from '../inputProcessing/pathHelper';
import * as Inputs from '../inputProcessing/inputs';

export const DEFINITION_TYPE = "definition";
export const ASSIGNMENT_TYPE = "assignment";
export const POLICY_OPERATION_CREATE = "CREATE";
export const POLICY_OPERATION_UPDATE = "UPDATE";
export const POLICY_OPERATION_NONE = "NONE";
export const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
export const POLICY_FILE_NAME = "policy.json";
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

export async function getAllPolicyRequests(): Promise<PolicyRequest[]> {

  const paths = getInputPaths();

  let policyRequests: PolicyRequest[] = [];

  try {
    // Get all policy definition, assignment objects
    const allPolicyDetails: PolicyDetails[] = getAllPolicyDetails();

    for (const policyDetails of allPolicyDetails) {
      const gitPolicy = policyDetails.policy;
      const currentHash = getObjectHash(gitPolicy);
      const azurePolicy = await getAzurePolicy(gitPolicy);

      if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND) {
        // There was some error while fetching the policy.
        prettyLog(`Failed to get policy with id ${gitPolicy.id}, path ${policyDetails.path}. Error : ${JSON.stringify(azurePolicy.error)}`);
      }
      else {
        const operationType = getPolicyOperationType(policyDetails, azurePolicy, currentHash);
        if (operationType == POLICY_OPERATION_CREATE || operationType == POLICY_OPERATION_UPDATE) {
          policyRequests.push(getPolicyRequest(policyDetails, currentHash, operationType));
        }
      }
    }
  }
  catch (error) {
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

// Returns all policy definitions and assignments.
function getAllPolicyDetails(): PolicyDetails[] {
  let policies: PolicyDetails[] = [];
  let policy: any;

  const definitionPaths = getAllPolicyDefinitionPaths();
  const assignmentPaths = getAllPolicyAssignmentPaths(definitionPaths);

  definitionPaths.forEach(definitionPath => {
    const definition = getPolicyDefinition(definitionPath);
    policies.push({
      path: definitionPath,
      policy: definition
    } as PolicyDetails);
  });

  assignmentPaths.forEach(assignmentPath => {
    const assignment = getPolicyAssignment(assignmentPath);
    policies.push({
      path: assignmentPath,
      policy: assignment
    } as PolicyDetails);
  });

  return policies;
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


/**
 * Helper Method's from here - START
 */

/**
 * Fetch file paths from action input
 */
function getInputPaths(): string[] {
  const pathsInput = core.getInput("paths");
  if (!pathsInput) {
    core.setFailed("No path supplied.");
    throw Error("No path supplied.");
  }
  return pathsInput.split('\n');
}

/**
 * This method, for a given policy in GitHub repo path, decides if the policy is a newly Created or will be updated
 * 
 * @param gitPolicyDetails : GitHub Policy
 * @param azurePolicy : Fetched policy from Azure Policy service
 * @param currentHash : Hash of the current policy in GitHub repo
 */
function getPolicyOperationType(gitPolicyDetails: PolicyDetails, azurePolicy: any, currentHash: string): string {
  if (azurePolicy.error) {
    //The error here will be 'HTTP - Not Found'. This scenario covers Create a New policy.
    prettyDebugLog(`Policy with id : ${gitPolicyDetails.policy.id}, path : ${gitPolicyDetails.path} does not exist in azure. A new policy will be created.`);
    return POLICY_OPERATION_CREATE;
  }

  /**
   * Mode can be: 
   *  Incremental - Push changes for only the files that have been updated in the commit
   *  Complete    - Ignore updates and push ALL files in the path
   */
  const mode = Inputs.mode;
  let azureHash = getHashFromMetadata(azurePolicy);

  if (Inputs.MODE_COMPLETE === mode || !azureHash) {
    /**
     * Scenario 1: If user chooses to override logic of hash comparison he can do it via 'mode' == Complete, ALL files in
     *  user defined path will be updated to Azure Policy Service irrespective of Hash match.
     * 
     * Scenario 2: If policy file Hash is not available on Policy Service (one such scenario will be the very first time this action
     * is run on an already existing policy) we need to update the file.
     */
    prettyDebugLog(`IgnoreHash is : ${mode} OR GitHub properties/metaData is not present for policy id : ${gitPolicyDetails.policy.id}`);
    return POLICY_OPERATION_UPDATE;
  }

  //If user has chosen to push only updated files i.e 'mode' == Incremental AND a valid hash is available in policy metadata compare them.
  prettyDebugLog(`Comparing Hash for policy id : ${gitPolicyDetails.policy.id} : ${azureHash === currentHash}`);
  return (azureHash === currentHash) ? POLICY_OPERATION_NONE : POLICY_OPERATION_UPDATE;

}

/**
 * Given a Policy Definition or Policy Assignment this method fetched Hash from metadata
 * 
 * @param azurePolicy Azure Policy
 */
function getHashFromMetadata(azurePolicy: any): string {
  const properties = azurePolicy.properties;
  if (!properties || !properties.metadata) {
    return undefined;
  }
  if (!properties.metadata[POLICY_METADATA_GITHUB_KEY] || !properties.metadata[POLICY_METADATA_GITHUB_KEY][POLICY_METADATA_HASH_KEY]) {
    return undefined;
  }
  return properties.metadata[POLICY_METADATA_GITHUB_KEY][POLICY_METADATA_HASH_KEY];
}

/**
 * Helper Method's - END
 */