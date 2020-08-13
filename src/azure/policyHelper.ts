import * as path from 'path';
import * as core from '@actions/core';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson, getAllJsonFilesPath } from '../utils/fileHelper';
import { getObjectHash } from '../utils/hashUtils'
import { getWorkflowRunUrl, printPartitionedText } from '../utils/utilities'

export const DEFINITION_TYPE = "Microsoft.Authorization/policyDefinitions";
export const ASSIGNMENT_TYPE = "Microsoft.Authorization/policyAssignments";
export const POLICY_OPERATION_CREATE = "CREATE";
export const POLICY_OPERATION_UPDATE = "UPDATE";
export const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
const POLICY_DEFINITION_NOT_FOUND = "PolicyDefinitionNotFound";
const POLICY_ASSIGNMENT_NOT_FOUND = "PolicyAssignmentNotFound";

export interface PolicyRequest {
  path: string;
  type: string;
  operation: string;
}

export interface PolicyRequest2 {
  path: string;
  policy: any;
  operation: string;
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
  let newPolicy: boolean = false;
  let updateRequired: boolean = false;
  let azureMetadata: any;
  let githubHash: string;
  let azureHash: string;
  let policy: any;
  let azPolicy: any;

  try {
    let allJsonFiles: string[] = getAllJsonFilesPath(paths);

    // Get all policy definition, assignment objects
    let policies: PolicyRequest[] = getAllPolicies(allJsonFiles);
    
    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();

    for (let policyDetails of policies) {
      policy = policyDetails.policy;
      githubHash = getObjectHash(policy);
      newPolicy = false;
      updateRequired = false;

      if (policy.type == DEFINITION_TYPE) {
        azPolicy = await azHttpClient.getPolicyDefinition(policy);
      }
      else {
        azPolicy = await azHttpClient.getPolicyAssignment(policy);
      }

      if (azPolicy.error) {
        // There was some error while getting the policy. Check if policy does not exist and needs to be created.
        if ((azPolicy.error.code == POLICY_DEFINITION_NOT_FOUND && policy.type == DEFINITION_TYPE)
        || (azPolicy.error.code == POLICY_ASSIGNMENT_NOT_FOUND && policy.type == ASSIGNMENT_TYPE)) {
            printPartitionedText(`Policy with id : ${policy.id}, path : ${policyDetails.path} does not exist in azure. A new policy will be created.`);
            newPolicy = true;
        }
        else {
          // TODO : DO we need to throw here?
          printPartitionedText(`Failed to get policy with id ${policy.id}, path ${policyDetails.path}. Error : ${JSON.stringify(azPolicy.error)}`);
          continue;
        }
      }
      else {
        // Policy exists in azure. Get the metadata for delta comparison.
        azureMetadata = azPolicy.properties.metadata;
      }

      if (!newPolicy) {
        if (azureMetadata[POLICY_METADATA_GITHUB_FILED]) {
          azureHash = azureMetadata[POLICY_METADATA_GITHUB_FILED][POLICY_METADATA_HASH_FIELD];
          if (azureHash == githubHash) {
            printPartitionedText(`Hash is same for policy id : ${policy.id}`);
            continue;
          }
          else {
            console.log("Hash is not same. We need to update.");
            updateRequired = true;
          }
        }
        else {
          printPartitionedText("Github metaData is not present. Will need to update");
          updateRequired = true;
        }
      }
      
      if (updateRequired || newPolicy) {
        policyDetails.policy = appendPolicyMetadata(policy, githubHash);
        policyDetails.operation = newPolicy ? POLICY_OPERATION_CREATE : POLICY_OPERATION_UPDATE;
        policyRequests.push(policyDetails);
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
function getAllPolicies(jsonPaths: string[]): PolicyRequest2[] {
  let policies: PolicyRequest2[] = [];

  jsonPaths.forEach((path) => {
    let policy = getPolicyObject(path);
    if (policy) {
      policies.push({
        path: path,
        policy: policy
      } as PolicyRequest2);
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

function appendPolicyMetadata(policy: any, hash: string): any {
  let metadata = getWorkflowMetadata(hash);
  if (!policy.properties.metadata) {
    policy.properties.metadata = {};
  }

  policy.properties.metadata.GitHubPolicy = metadata;

  return policy;
}