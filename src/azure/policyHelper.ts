import * as path from 'path';
import * as core from '@actions/core';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson } from '../utils/fileHelper';
import { getObjectHash } from '../utils/hashUtils';
import { getWorkflowRunUrl, prettyLog, prettyDebugLog } from '../utils/utilities';
import { isEnforced, isNonEnforced, getAllPolicyAssignmentPaths, getAllPolicyDefinitionPaths } from '../inputProcessing/pathHelper';
import * as Inputs from '../inputProcessing/inputs';

export const DEFINITION_TYPE = "definition";
export const ASSIGNMENT_TYPE = "assignment";
export const POLICY_OPERATION_CREATE = "CREATE";
export const POLICY_OPERATION_UPDATE = "UPDATE";
export const POLICY_OPERATION_NONE = "NONE";
export const POLICY_RESULT_FAILED = "FAILED";
export const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
export const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
const POLICY_DEFINITION_NOT_FOUND = "PolicyDefinitionNotFound";
const POLICY_ASSIGNMENT_NOT_FOUND = "PolicyAssignmentNotFound";
const POLICY_METADATA_GITHUB_KEY = "gitHubPolicy";
const POLICY_METADATA_HASH_KEY = "digest";
const ENFORCEMENT_MODE_KEY = "enforcementMode";
const ENFORCEMENT_MODE_ENFORCE = "Default";
const ENFORCEMENT_MODE_DO_NOT_ENFORCE = "DoNotEnforce";

export interface PolicyRequest {
  path: string;
  type: string;
  operation: string;
}

export interface PolicyDetails {
  policyInCode: any;
  path: string;
  policyInService: any;
}

export interface PolicyResult {
  path: string;
  type: string;
  operation: string;
  displayName: string;
  status: string;
  message: string;
  policyDefinitionId: string;
}

export interface PolicyMetadata {
  commitSha: string;
  digest: string;
  repoName: string;
  runUrl: string;
  filepath: string;
}

export async function getAllPolicyRequests(): Promise<PolicyRequest[]> {

  const paths = getInputPaths();

  let policyRequests: PolicyRequest[] = [];

  try {
    // Get all policy definition, assignment objects
    const allPolicyDetails: PolicyDetails[] = await getAllPolicyDetails();

    for (const policyDetails of allPolicyDetails) {
      const gitPolicy = policyDetails.policyInCode;
      const currentHash = getObjectHash(gitPolicy);
      const azurePolicy = policyDetails.policyInService;

      if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND) {
        // There was some error while fetching the policy.
        prettyLog(`Failed to get policy with id ${gitPolicy.id}, path ${policyDetails.path}. Error : ${JSON.stringify(azurePolicy.error)}`);
      }
      else {
        const operationType = getPolicyOperationType(policyDetails, currentHash);
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

  const definitionResponses = await azHttpClient.upsertPolicyDefinitions(definitionRequests);
  policyResults.push(...getPolicyResults(definitionRequests, definitionResponses));

  const assignmentResponses = await azHttpClient.upsertPolicyAssignments(assignmentRequests);
  policyResults.push(...getPolicyResults(assignmentRequests, assignmentResponses));

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

  validateDefinition(definition, definitionPath);
  return definition;
}

function getPolicyAssignment(assignmentPath: string): any {
  const assignment = getFileJson(assignmentPath);
  if (isNonEnforced(assignmentPath)) {
    if(!assignment.properties) {
      assignment.properties = {};
    }

    core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_DO_NOT_ENFORCE}'. Overriding...`);
    assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_DO_NOT_ENFORCE;
  } else if (isEnforced(assignmentPath)) {
    if (!assignment.properties) {
      assignment.properties = {};
    }

    core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_ENFORCE}'. Overriding...`);
    assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_ENFORCE;
  }

  validateAssignment(assignment, assignmentPath);
  return assignment;
}

function getPolicyResults(policyRequests: PolicyRequest[], policyResponses: any[]): PolicyResult[] {
  let policyResults: PolicyResult[] = [];

  policyRequests.forEach((policyRequest, index) => {
    const isCreate: boolean = isCreateOperation(policyRequest);
    const azureResponse: any = policyResponses[index];
    const policyType: string = policyRequest.policy.type == DEFINITION_TYPE ? 'definition' : 'assignment';
    const policyDefinitionId: string = policyRequest.policy.type == DEFINITION_TYPE ? policyRequest.policy.id : policyRequest.policy.properties.policyDefinitionId;
    let status = "";
    let message = "";

    if (!azureResponse) {
      status = POLICY_RESULT_FAILED;
      message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy ${policyType}.`;
    }
    else if (azureResponse.error) {
      status = POLICY_RESULT_FAILED;
      message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy ${policyType}. Error: ${azureResponse.error.message}`;
    }
    else {
      status = POLICY_RESULT_SUCCEEDED;
      message = `Policy ${policyType} ${isCreate ? 'created' : 'updated'} successfully`;
    }

    policyResults.push({
      path: policyRequest.path,
      type: policyRequest.policy.type,
      operation: policyRequest.operation,
      displayName: policyRequest.policy.name,
      status: status,
      message: message,
      policyDefinitionId: policyDefinitionId
    });
  });

  return policyResults;
}

function isCreateOperation(policyRequest: PolicyRequest): boolean {
  return policyRequest.operation == POLICY_OPERATION_CREATE;
}

function validateDefinition(definition: any, path: string): void {
  if (!definition.id) {
    throw Error(`Path : ${path}. Property id is missing from the policy definition. Please add id to the policy.json file.`);
  }

  if (!definition.name) {
    throw Error(`Path : ${path}. Property name is missing from the policy definition. Please add name to the policy.json file.`);
  }

  if (!definition.type) {
    throw Error(`Path : ${path}. Property type is missing from the policy definition. Please add type to the policy.json file.`);
  }
}

function validateAssignment(assignment: any, path: string): void {
  if (!assignment.id) {
    throw Error(`Path : ${path}. Property id is missing from the policy assignment. Please add id to the assignment file.`);
  }

  if (!assignment.name) {
    throw Error(`Path : ${path}. Property name is missing from the policy assignment. Please add name to the assignment file.`);
  }

  if (!assignment.type) {
    throw Error(`Path : ${path}. Property type is missing from the policy assignment. Please add type to the assignment file.`);
  }
}

// Returns all policy definitions and assignments.
async function getAllPolicyDetails(): Promise<PolicyDetails[]> {
  let allPolicyDetails: PolicyDetails[] = [];

  const definitionPaths = getAllPolicyDefinitionPaths();
  const assignmentPaths = getAllPolicyAssignmentPaths(definitionPaths);

  definitionPaths.forEach(definitionPath => {
    const definition = getPolicyDefinition(definitionPath);
    allPolicyDetails.push({
      path: definitionPath,
      policyInCode: definition
    } as PolicyDetails);
  });

  assignmentPaths.forEach(assignmentPath => {
    const assignment = getPolicyAssignment(assignmentPath);
    allPolicyDetails.push({
      path: assignmentPath,
      policyInCode: assignment
    } as PolicyDetails);
  });

  // Fetch policies from service
  const azHttpClient = new AzHttpClient();
  await azHttpClient.initialize();
  await azHttpClient.populateServicePolicies(allPolicyDetails); 

  return allPolicyDetails;
}

function getWorkflowMetadata(policyHash: string, filepath: string): PolicyMetadata {
  let metadata: PolicyMetadata = {
    digest: policyHash,
    repoName: process.env.GITHUB_REPOSITORY,
    commitSha: process.env.GITHUB_SHA,
    runUrl: getWorkflowRunUrl(),
    filepath: filepath
  }

  return metadata;
}

function getPolicyRequest(policyDetails: PolicyDetails, hash: string, operation: string): PolicyRequest {
  let metadata = getWorkflowMetadata(hash, policyDetails.path);

  if (!policyDetails.policyInCode.properties) {
    policyDetails.policyInCode.properties = {};
  }

  if (!policyDetails.policyInCode.properties.metadata) {
    policyDetails.policyInCode.properties.metadata = {};
  }

  policyDetails.policyInCode.properties.metadata[POLICY_METADATA_GITHUB_KEY] = metadata;

  let policyRequest: PolicyRequest = {
    policy: policyDetails.policyInCode,
    path: policyDetails.path,
    operation: operation
  }
  return policyRequest;
}

/**
 * Helper Method's from here - START
 */

/**
 * This method, for a given policy in GitHub repo path, decides if the policy is a newly Created or will be updated
 * 
 * @param policyDetails : Policy Details
 * @param currentHash : Hash of the current policy in GitHub repo
 */
function getPolicyOperationType(policyDetails: PolicyDetails, currentHash: string): string {
  const policyInCode = policyDetails.policyInCode;
  const policyInService = policyDetails.policyInService;

  if (policyInService.error) {
    //The error here will be 'HTTP - Not Found'. This scenario covers Create a New policy.
    prettyDebugLog(`Policy with id : ${policyInCode.id}, path : ${policyDetails.path} does not exist in azure. A new policy will be created.`);
    return POLICY_OPERATION_CREATE;
  }

  /**
   * Mode can be: 
   *  Incremental - Push changes for only the files that have been updated in the commit
   *  Complete    - Ignore updates and push ALL files in the path
   */
  const mode = Inputs.mode;
  let azureHash = getHashFromMetadata(policyInService);

  if (Inputs.MODE_COMPLETE === mode || !azureHash) {
    /**
     * Scenario 1: If user chooses to override logic of hash comparison he can do it via 'mode' == Complete, ALL files in
     *  user defined path will be updated to Azure Policy Service irrespective of Hash match.
     * 
     * Scenario 2: If policy file Hash is not available on Policy Service (one such scenario will be the very first time this action
     * is run on an already existing policy) we need to update the file.
     */
    prettyDebugLog(`IgnoreHash is : ${mode} OR GitHub properties/metaData is not present for policy id : ${policyInCode.id}`);
    return POLICY_OPERATION_UPDATE;
  }

  //If user has chosen to push only updated files i.e 'mode' == Incremental AND a valid hash is available in policy metadata compare them.
  prettyDebugLog(`Comparing Hash for policy id : ${policyInCode.id} : ${azureHash === currentHash}`);
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