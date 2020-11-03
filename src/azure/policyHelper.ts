import * as path from 'path';
import * as core from '@actions/core';
import { StatusCodes } from "../utils/httpClient";
import { AzHttpClient } from './azHttpClient';
import { handleForceUpdate } from './forceUpdateHelper';
import { getFileJson } from '../utils/fileHelper';
import { getObjectHash } from '../utils/hashUtils';
import { getWorkflowRunUrl, prettyLog, prettyDebugLog, populatePropertyFromJsonFile } from '../utils/utilities';
import { isEnforced, isNonEnforced, getAllPolicyAssignmentPaths, getAllPolicyDefinitionPaths, getAllInitiativesPaths } from '../inputProcessing/pathHelper';
import * as Inputs from '../inputProcessing/inputs';
import { v4 as uuidv4 } from 'uuid';

export const DEFINITION_TYPE = "Microsoft.Authorization/policyDefinitions";
export const INITIATIVE_TYPE = "Microsoft.Authorization/policySetDefinitions";
export const ASSIGNMENT_TYPE = "Microsoft.Authorization/policyAssignments";
export const ROLE_ASSIGNMNET_TYPE = "Microsoft.Authorization/roleAssignments";
export const POLICY_OPERATION_CREATE = "CREATE";
export const POLICY_OPERATION_UPDATE = "UPDATE";
export const POLICY_OPERATION_NONE = "NONE";
export const POLICY_RESULT_FAILED = "FAILED";
export const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
export const POLICY_FILE_NAME = "policy.json";
export const POLICY_INITIATIVE_FILE_NAME = "policyset.json";
export const FRIENDLY_DEFINITION_TYPE = "definition";
export const FRIENDLY_INITIATIVE_TYPE = "initiative";
export const FRIENDLY_ASSIGNMENT_TYPE = "assignment";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
const INITIATIVE_PARAMETERS_FILE_NAME = "policyset.parameters.json";
const INITIATIVE_DEFINITIONS_FILE_NAME = "policyset.definitions.json";
const POLICY_DEFINITION_NOT_FOUND = "PolicyDefinitionNotFound";
const POLICY_ASSIGNMENT_NOT_FOUND = "PolicyAssignmentNotFound";
const POLICY_INITIATIVE_NOT_FOUND = "PolicySetDefinitionNotFound";
const POLICY_METADATA_GITHUB_KEY = "gitHubPolicy";
const POLICY_METADATA_HASH_KEY = "digest";
const ENFORCEMENT_MODE_KEY = "enforcementMode";
const ENFORCEMENT_MODE_ENFORCE = "Default";
const ENFORCEMENT_MODE_DO_NOT_ENFORCE = "DoNotEnforce";
const POLICY_DEFINITION_BUILTIN = "BuiltIn";

export interface PolicyRequest {
  path: string;
  policy: any;
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

export interface RoleRequest {
  scope: string;
  roleAssignmentId: string;
  roleDefinitionId: string;
  principalId: string;
  policyAssignmentId: string;
  policyDefinitionId: string;
  path: string;
}

export async function getAllPolicyRequests(): Promise<PolicyRequest[]> {
  let policyRequests: PolicyRequest[] = [];

  try {
    // Get all policy definition, assignment objects
    const allPolicyDetails: PolicyDetails[] = await getAllPolicyDetails();

    for (const policyDetails of allPolicyDetails) {
      const gitPolicy = policyDetails.policyInCode;
      const currentHash = getObjectHash(gitPolicy);
      const azurePolicy = policyDetails.policyInService;

      if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND && azurePolicy.error.code != POLICY_INITIATIVE_NOT_FOUND ) {
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

  // Dividing policy requests into definitions, initiatives and assignments.
  const [definitionRequests, initiativeRequests, assignmentRequests] = dividePolicyRequests(policyRequests);

  const definitionResponses = await azHttpClient.upsertPolicyDefinitions(definitionRequests);

  // In case we have force update
  if (Inputs.forceUpdate) {
    await handleForceUpdate(definitionRequests, definitionResponses, assignmentRequests, policyResults);
  }

  policyResults.push(...getPolicyResults(definitionRequests, definitionResponses, FRIENDLY_DEFINITION_TYPE));

  const initiativeResponses = await azHttpClient.upsertPolicyInitiatives(initiativeRequests);
  policyResults.push(...getPolicyResults(initiativeRequests, initiativeResponses, FRIENDLY_INITIATIVE_TYPE));

  const assignmentResponses = await azHttpClient.upsertPolicyAssignments(assignmentRequests);
  policyResults.push(...getPolicyResults(assignmentRequests, assignmentResponses, FRIENDLY_ASSIGNMENT_TYPE));

  // Now we need to add roles to managed identity for policy remediation.
  await assignRoles(assignmentRequests, assignmentResponses, policyResults);

  return Promise.resolve(policyResults);
}

function dividePolicyRequests(policyRequests: PolicyRequest[]) {
  let definitionRequests: PolicyRequest[] = [];
  let initiativeRequests: PolicyRequest[] = [];
  let assignmentRequests: PolicyRequest[] = [];

  policyRequests.forEach(policyRequest => {
    switch(policyRequest.policy.type) {
      case DEFINITION_TYPE : 
        definitionRequests.push(policyRequest);
        break;
      case INITIATIVE_TYPE : 
        initiativeRequests.push(policyRequest);
        break;
      case ASSIGNMENT_TYPE : 
        assignmentRequests.push(policyRequest);
        break;
      default :
        prettyDebugLog(`Unknown type for policy in path : ${policyRequest.path}`);
    }
  });
  
  return [definitionRequests, initiativeRequests, assignmentRequests];
}

async function assignRoles(assignmentRequests: PolicyRequest[], assignmentResponses: any[], roleAssignmentResults: PolicyResult[]) {
  let filteredAssignments = filterIdentityAssignments(assignmentRequests, assignmentResponses);
  let allRoleDefinitions = await paresRoleDefinitions(filteredAssignments, roleAssignmentResults);
  let roleRequests: RoleRequest[] = getRoleRequests(filteredAssignments, allRoleDefinitions);

  await createRoles(roleRequests, roleAssignmentResults);
}

function filterIdentityAssignments(assignmentRequests: PolicyRequest[], assignmentResponses: any[]): any[]{
 let filteredAssignments: any[] = [];

 assignmentRequests.forEach((assignmentRequest, index) => {
  let assignmentResponse = assignmentResponses[index];
  // We will assign roles only when assignmnet was created and has identity field has principalId in it.
  if (isCreateOperation(assignmentRequest) && assignmentResponse.identity && assignmentResponse.identity.principalId) {
    // We will add path in assignment as it is required later.
    assignmentResponse.path = assignmentRequest.path;
    filteredAssignments.push(assignmentResponse);
  }
 });

 return filteredAssignments;
}

async function paresRoleDefinitions(policyAssignments: any[], roleAssignmentResults: PolicyResult[]): Promise<any> {
  let roleDefinitions = {};
  const policyDefinitionIds: string[] = policyAssignments.map(assignment => assignment.properties.policyDefinitionId);

  try {
    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();
    let policyDefinitions = await azHttpClient.getPolicyDefintions(policyDefinitionIds);
    policyDefinitions.forEach((definition, index) => {
      if (definition.error) {
        let policyAssignment = policyAssignments[index];
        let message = definition.error.message ? definition.error.message : "Could not get policy definition from Azure";
        roleAssignmentResults.push(getRoleAssignmentResult(policyAssignment.path, policyAssignment.id, policyAssignment.properties.policyDefinitionId, POLICY_RESULT_FAILED, message));
      }
      else {
        let roleDefinitionIds: string[] = getRoleDefinitionIds(definition);
        if (roleDefinitionIds && roleDefinitionIds.length > 0) {
          // We need last part of role definition id 
          roleDefinitions[definition.id] = roleDefinitionIds.map(roleDefinitionId => roleDefinitionId.split("/").pop());
        }
        else {
          prettyLog(`Could not find role definition ids for adding role assignments to the managed identity. Definition Id : ${definition.id}`);
        }
      }
    });
  }
  catch (error) {
    prettyDebugLog(`An error occurred while getting role requests for missing policy definitions. Error : ${error}`);
    throw new Error(`An error occurred while getting role requests for missing policy definitions. Error: ${error}`);
  }

  return roleDefinitions;
}

function getRoleAssignmentResult(path: string, assignmentId: string, definitionId: string, status: string, message: string): PolicyResult {
  return {
    path: path,
    type: ROLE_ASSIGNMNET_TYPE,
    operation: POLICY_OPERATION_CREATE,
    displayName: `Role Assignment for policy policy assignment id : ${assignmentId}`,
    status: status,
    message: message,
    policyDefinitionId: definitionId
  }
}

function getRoleRequests(policyAssignments: any[], allRoleDefinitions: any): RoleRequest[] {
  let roleRequests: RoleRequest[] = [];
  policyAssignments.forEach(policyAssignment => {
    let roleDefinitions = allRoleDefinitions[policyAssignment.properties.policyDefinitionId];
    if (roleDefinitions) {
      roleDefinitions.forEach(roleId => {
        roleRequests.push({
          scope: policyAssignment.properties.scope,
          roleAssignmentId: uuidv4(),
          roleDefinitionId: roleId,
          principalId: policyAssignment.identity.principalId,
          policyAssignmentId: policyAssignment.id,
          policyDefinitionId: policyAssignment.properties.policyDefinitionId,
          path: policyAssignment.path
        });
      });
    }
  });

  return roleRequests;
}

async function createRoles(roleRequests: RoleRequest[], roleAssignmentResults: PolicyResult[]) {
  if (roleRequests.length == 0) {
    prettyDebugLog(`No role assignments needs to be created`);
    return;
  }

  try {
    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();
    let responses = await azHttpClient.addRoleAssinments(roleRequests);

    responses.forEach((response, index) => {
      let roleRequest = roleRequests[index];
      let message = `Role Assignment created with id : ${response.content.id}`;
      let status = POLICY_RESULT_SUCCEEDED;

      if (response.httpStatusCode == StatusCodes.CREATED) {
        prettyDebugLog(`Role assignment created with id ${response.content.id} for assignmentId : ${roleRequest.policyAssignmentId}`);
      }
      else {
        prettyLog(`Role assignment could not be created related to assignment id ${roleRequest.policyAssignmentId}. Status : ${response.httpStatusCode}`);

        message = response.content.error ? response.content.error.message : `Role Assignment could not be created. Status : ${response.httpStatusCode}`;
        status = POLICY_RESULT_FAILED;
      }
      roleAssignmentResults.push(getRoleAssignmentResult(roleRequest.path, roleRequest.policyAssignmentId , roleRequest.policyDefinitionId, status, message));
    });
  }
  catch (error) {
    prettyLog(`An error occurred while creating role assignments. Error: ${error}`);
    throw new Error(`An error occurred while creating role assignments. Error: ${error}`);
  }
}

function getRoleDefinitionIds(policyDefinition: any): string[] {
  if ( policyDefinition.properties 
    && policyDefinition.properties.policyRule 
    && policyDefinition.properties.policyRule.then 
    && policyDefinition.properties.policyRule.then.details 
    && policyDefinition.properties.policyRule.then.details.roleDefinitionIds) 
    {
      return policyDefinition.properties.policyRule.then.details.roleDefinitionIds;
    }

  return undefined;
}

function getPolicyDefinition(definitionPath: string): any {
  const policyPath = path.join(definitionPath, POLICY_FILE_NAME);
  const policyRulesPath = path.join(definitionPath, POLICY_RULES_FILE_NAME);
  const policyParametersPath = path.join(definitionPath, POLICY_PARAMETERS_FILE_NAME);

  let definition = getFileJson(policyPath);
  validatePolicy(definition, definitionPath, FRIENDLY_DEFINITION_TYPE);

  if (!definition.properties) definition.properties = {};
  if (!definition.properties.policyRule) populatePropertyFromJsonFile(definition.properties, policyRulesPath, "policyRule");
  if (!definition.properties.parameters) populatePropertyFromJsonFile(definition.properties, policyParametersPath, "parameters");
  
  return definition;
}

function getPolicyInitiative(initiativePath: string): any {
  const initiativeFilePath = path.join(initiativePath, POLICY_INITIATIVE_FILE_NAME);
  const initiativeDefinitionsPath = path.join(initiativePath, INITIATIVE_DEFINITIONS_FILE_NAME);
  const initiativeParametersPath = path.join(initiativePath, INITIATIVE_PARAMETERS_FILE_NAME);
  
  let initiative = getFileJson(initiativeFilePath);
  validatePolicy(initiative, initiativePath, FRIENDLY_INITIATIVE_TYPE);

  if (!initiative.properties) initiative.properties = {};
  if (!initiative.properties.policyDefinitions) populatePropertyFromJsonFile(initiative.properties, initiativeDefinitionsPath, "policyDefinitions");
  if (!initiative.properties.parameters) populatePropertyFromJsonFile(initiative.properties, initiativeParametersPath, "parameters");

  return initiative;
}

export function getPolicyAssignments(assignmentPaths: string[]): any[] {
  let assignments: any[] = [];

  assignmentPaths.forEach(path => {
    assignments.push(getPolicyAssignment(path));
  })

  return assignments;
}

export function getPolicyAssignment(assignmentPath: string): any {
  const assignment = getFileJson(assignmentPath);
  validatePolicy(assignment, assignmentPath, FRIENDLY_ASSIGNMENT_TYPE);

  if (!assignment.properties) {
    assignment.properties = {};
  }

  if (isNonEnforced(assignmentPath)) {
    core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_DO_NOT_ENFORCE}'. Overriding...`);
    assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_DO_NOT_ENFORCE;
  } else if (isEnforced(assignmentPath)) {
    core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_ENFORCE}'. Overriding...`);
    assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_ENFORCE;
  }

  return assignment;
}

export function getPolicyResults(policyRequests: PolicyRequest[], policyResponses: any[], policyType: string): PolicyResult[] {
  let policyResults: PolicyResult[] = [];
  policyResponses = policyResponses.map(response => response.content);

  policyRequests.forEach((policyRequest, index) => {
    const isCreate: boolean = isCreateOperation(policyRequest);
    const azureResponse: any = policyResponses[index];
    const policyDefinitionId: string = policyRequest.policy.type == ASSIGNMENT_TYPE ? policyRequest.policy.properties.policyDefinitionId : policyRequest.policy.id;
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

function validatePolicy(policy: any, path: string, type: string): void {
  if (!policy) {
    throw Error(`Path : ${path}. JSON file is invalid.`);
  }

  if (!policy.id) {
    throw Error(`Path : ${path}. Property id is missing from the policy ${type}. Please add id to the ${type} file.`);
  }

  if (!policy.name) {
    throw Error(`Path : ${path}. Property name is missing from the policy ${type}. Please add name to the ${type} file.`);
  }

  if (!policy.type) {
    throw Error(`Path : ${path}. Property type is missing from the policy ${type}. Please add type to the ${type} file.`);
  }
}

// Returns all policy definitions and assignments.
async function getAllPolicyDetails(): Promise<PolicyDetails[]> {
  let allPolicyDetails: PolicyDetails[] = [];

  const definitionPaths = getAllPolicyDefinitionPaths();
  const initiativePaths = getAllInitiativesPaths();
  const assignmentPaths = getAllPolicyAssignmentPaths();

  definitionPaths.forEach(definitionPath => {
    const definitionDetails = getPolicyDetails(definitionPath, DEFINITION_TYPE);
    if (!!definitionDetails) {
      allPolicyDetails.push(definitionDetails);
    }
  });

  initiativePaths.forEach(initiativePath => {
    const initiativeDetails = getPolicyDetails(initiativePath, INITIATIVE_TYPE);
    if (!!initiativeDetails) {
      allPolicyDetails.push(initiativeDetails);
    }
  });

  assignmentPaths.forEach(assignmentPath => {
    const assignmentDetails = getPolicyDetails(assignmentPath, ASSIGNMENT_TYPE);
    if (!!assignmentDetails) {
      allPolicyDetails.push(assignmentDetails);
    }
  });

  // Fetch policies from service
  const azHttpClient = new AzHttpClient();
  await azHttpClient.initialize();
  await azHttpClient.populateServicePolicies(allPolicyDetails); 

  return allPolicyDetails;
}

function getPolicyDetails(policyPath: string, policyType: string): PolicyDetails {
  let policyDetails: PolicyDetails = {} as PolicyDetails;
  let policy: any;

  try {
    switch(policyType){
      case DEFINITION_TYPE : policy = getPolicyDefinition(policyPath); break;
      case INITIATIVE_TYPE : policy = getPolicyInitiative(policyPath); break;
      case ASSIGNMENT_TYPE : policy = getPolicyAssignment(policyPath); break;
    }

    // For definitions and initiatives we have policyType field. For assignment this field is not present so it will be ignored.
    if (policy.properties && policy.properties.policyType == POLICY_DEFINITION_BUILTIN) {
      prettyDebugLog(`Ignoring policy with BuiltIn type. Id : ${policy.id}, path : ${policyPath}`);
      policyDetails = undefined;
    }
    else {
      policyDetails.path = policyPath;
      policyDetails.policyInCode = policy;
    }
  }
  catch (error) {
    prettyLog(`Error occured while reading policy in path : ${policyPath}. Error : ${error}`);
    policyDetails = undefined;
  }
  
  return policyDetails;
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

export function createPoliciesUsingIds(policyIds: string[]): any[] {
  let policies = [];

  policyIds.forEach(policyId => {
    policies.push({
      id : policyId
    });
  });

  return policies;
}

/**
 * Helper Method's - END
 */