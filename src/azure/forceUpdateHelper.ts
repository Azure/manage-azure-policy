import * as core from '@actions/core';
import { StatusCodes } from "../utils/httpClient";
import { POLICY_OPERATION_CREATE, POLICY_OPERATION_UPDATE, PolicyRequest, PolicyResult, getPolicyAssignment, getPolicyAssignments, getPolicyResults, DEFINITION_TYPE, ASSIGNMENT_TYPE  } from './policyHelper'
import { prettyDebugLog, prettyLog } from '../utils/utilities'
import { getAllAssignmentInPaths } from '../inputProcessing/pathHelper';
import { AzHttpClient } from './azHttpClient';

export const POLICY_OPERATION_FORCE_UPDATE = "FORCE_UPDATE";
export const POLICY_OPERATION_FORCE_CREATE = "FORCE_CREATE";
const ID_DUPLICATE_SUFFIX = "_84WCDn7pF0KY5Werq3iPqA"; // Short GUID
const DISPLAY_NAME_DUPLICATE_SUFFIX = " - Duplicate";

export async function handleForceUpdate(definitionRequests: PolicyRequest[], policyResponses: any[], assignmentRequests: PolicyRequest[], policyResults: PolicyResult[]) {
  let badRequests: PolicyRequest[] = filterBadRequests(definitionRequests, policyResponses);

  if (badRequests.length > 0) {
    prettyLog("ForceUpdate : Start");
    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();

    const policyDefinitionIds: string[] = badRequests.map(request => request.policy.id);
    
    let allDefinitionAssignments: any[][];
    let definitionsInService: any[];

    // Get all definitions and assignments from Azure
    try {
      allDefinitionAssignments = await getAllDefinitionsAssignment(policyDefinitionIds, azHttpClient);
      definitionsInService = await azHttpClient.getPolicyDefintions(policyDefinitionIds);
      validatePolicies(definitionsInService);
    }
    catch (error) {
      prettyLog(`Could not get assignments or definitions from azure. Abandoning force update. Error : ${error}`);
      return;
    }

    // Check if all assignments are present in repo
    if (checkAssignmentsExists(badRequests, allDefinitionAssignments)) {
      console.log(`All assignments are present. We will proceed with force update.`);

      // Get all assignments in one array
      let assignmentsInService: any[] = [].concat(...allDefinitionAssignments);
      let repoDefinitionResponses: any[], repoAssignmentRequests: any[], repoAssignmentResponses: any[];

      try{
        [repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses] = await startForceUpdate(badRequests, definitionsInService, assignmentsInService, azHttpClient);
      }
      catch (error) {
        prettyLog(`ForceUpdate Failed. Error : ${error}`);
        return;
      }

      // Need to avoid duplicate updation so we will remove entries from definitionRequests and assignmentRequests.
      removePolicyDefinitionRequests(definitionRequests, policyResponses, badRequests);
      removeAssignmentRequests(assignmentRequests, repoAssignmentResponses);

      // Populate results
      populateResults(badRequests, repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses, policyResults);
      prettyLog("ForceUpdate : End");
    }
    else {
      console.log(`Cannot force update as some assignments are missing in code.`);
    }
  }
  else {
    prettyDebugLog(`No definition needs to be force updated`);
  }
}

async function startForceUpdate(badRequests: PolicyRequest[], definitionsInService: any[], assignmentsInService: any[], azHttpClient: AzHttpClient): Promise<any[][]> {
  let duplicateDefinitions: any[], duplicateAssignments: any[];

  // Duplicate definitions and assignments in Azure before deletion
  try {
    [duplicateDefinitions, duplicateAssignments] = await createDuplicatePolicies(definitionsInService, assignmentsInService, azHttpClient);
  }
  catch (error) {
    console.log(`Error occurred while creating duplicate policies. Abandoning force update. Error : ${error}`);
    throw Error(error);
  }

  // Delete policies in Azure
  const leftoutPolicyIdsInService = await deleteAssignmentAndDefinitions(definitionsInService, assignmentsInService, azHttpClient);
  if (leftoutPolicyIdsInService.length > 0) {
    console.log(`Deletion of existing policies in Azure failed. Abandoning force update`);
    await revertOldPoliciesAndDeleteDuplicates(definitionsInService, assignmentsInService, duplicateDefinitions, duplicateAssignments, azHttpClient);
    throw Error(`Deletion of existing policies in Azure failed.`);
  }

  // Create fresh policies from repo
  let repoDefinitionResponses: any[], repoAssignmentRequests: any[], repoAssignmentResponses: any[];

  try {
    [repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses] = await createPoliciesFromCode(badRequests, azHttpClient);
  }
  catch (error) {
    console.log(`Error occurred while creating policies from code. Abandoning force update. Error : ${error}`);
    // Could not create policies from code. Will revert policies in service
    await revertOldPoliciesAndDeleteDuplicates(definitionsInService, assignmentsInService, duplicateDefinitions, duplicateAssignments, azHttpClient);
    throw Error(error);
  }

  // Delete duplicate policies
  const leftoutDuplicatePolicyIds = await deleteAssignmentAndDefinitions(duplicateDefinitions, duplicateAssignments, azHttpClient);

  if (leftoutDuplicatePolicyIds.length > 0) {
    console.log(`Could not delete duplicate policies.`);
    // TODO PM: what to do now? policies are updated but duplicates could not be deleted.
  }

  return [repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses];
}

async function revertOldPoliciesAndDeleteDuplicates(definitions: any[], assignments: any[], duplicateDefinitions: any[], duplicateAssignments: any[], azHttpClient: AzHttpClient) {
  try {
    await upsertOldPolicies(definitions, assignments, azHttpClient);
  }
  catch (error) {
    console.log(`Could not upsert old policies.`);

    // TODO PM: What to do now ? we have some of the old policies and all duplicate policies in azure.
    return;
  }
  
  // Old policies are reverted. Now delete duplicate definitions
  const leftoutDuplicatePolicyIds= await deleteAssignmentAndDefinitions(duplicateDefinitions, duplicateAssignments, azHttpClient);
  
  if (leftoutDuplicatePolicyIds.length > 0) {
    console.log(`Could not delete duplicate policies.`);
    // TODO PM: What to do now? Old policies are there and some duplicates are also there.
  }
}
  
function checkAssignmentsExists(definitionRequests: PolicyRequest[], allDefinitionAssignments: any[][]): boolean {
  let allAssignmentsArePresent: boolean = true;

  definitionRequests.forEach((definitionRequest, index) => {
    const assignmentsInCodePath = getAllAssignmentInPaths([definitionRequest.path]);
    const assignmentsInCode = getPolicyAssignments(assignmentsInCodePath);
    const assignmentsInService = allDefinitionAssignments[index];

    if (!areAllAssignmentInCode(assignmentsInCode, assignmentsInService)) {
      allAssignmentsArePresent = false;
      console.log(`1 or more assignments are missing for definition id : ${definitionRequest.policy.id}`);
    }
  });

  return allAssignmentsArePresent;
}
  
function areAllAssignmentInCode(assignmentsInCode: any[], assignmentsInService: any[]): boolean {
  if (assignmentsInCode.length < assignmentsInService.length) {
    return false;
  } 

  const assignmentsInCodeIds: string[] = getPolicyIds(assignmentsInCode);
  const assignmentsInServiceIds: string[] = getPolicyIds(assignmentsInService);

  return assignmentsInServiceIds.every(assignmentId => assignmentsInCodeIds.includes(assignmentId));
}

function filterBadRequests(policyRequests: PolicyRequest[], policyResponses: any[]): PolicyRequest[] {
  let badRequests: PolicyRequest[] = [];
  policyRequests.forEach((policyRequest, index) => {
    const policyResponse = policyResponses[index];
    // We will only consider bad request in case of update.
    if (policyRequest.operation == POLICY_OPERATION_UPDATE && policyResponse.httpStatusCode == StatusCodes.BAD_REQUEST) {
      badRequests.push(policyRequest);
    }
  });

  return badRequests;
}
  
async function getAllDefinitionsAssignment(policyDefinitionIds: string[], azHttpClient: AzHttpClient): Promise<any[]> {
  const responses = await azHttpClient.getAllAssignments(policyDefinitionIds);

  // Check if all request are successful
  responses.forEach(response => {
    if (response.httpStatusCode != StatusCodes.OK) {
      const message = response.content.error ? response.content.error.message : 'Error while getting assignments';
      throw Error(message);
    }
  });

  return responses.map(response => response.content.value)
}

async function createDuplicatePolicies(policyDefinitions: any[], policyAssignments: any[], azHttpClient: AzHttpClient): Promise<any[][]> {
  core.debug('Force Update : Creating Duplicate Policies');
  const duplicateDefinitionRequests = createDuplicateRequests(policyDefinitions);
  const duplicateAssignmentRequests = createDuplicateRequests(policyAssignments);

  const [duplicateDefinitionsResponses, duplicateAssignmentsResponses] = await createPolicies(duplicateDefinitionRequests, duplicateAssignmentRequests, azHttpClient, true);

  return [getPoliciesFromResponse(duplicateDefinitionsResponses), getPoliciesFromResponse(duplicateAssignmentsResponses)];
}

function createDuplicateRequests(policies: any[]): PolicyRequest[] {
  let policyRequests: PolicyRequest[] = [];

  policies.forEach(policy => {
    // Clone the policy object
    let policyClone = JSON.parse(JSON.stringify(policy));
    appendDuplicateSuffix(policyClone);

    policyRequests.push({
      path: "NA",
      operation: POLICY_OPERATION_CREATE,
      policy: policyClone
    });
  });

  return policyRequests;
}

function appendDuplicateSuffix(policy: any) {
  policy.id = `${policy.id}${ID_DUPLICATE_SUFFIX}`;
  policy.name = `${policy.name}${ID_DUPLICATE_SUFFIX}`;

  if (policy.properties.displayName) {
    policy.properties.displayName += DISPLAY_NAME_DUPLICATE_SUFFIX;
  }

  // For policy assignment
  if (policy.properties.policyDefinitionId) {
      policy.properties.policyDefinitionId = `${policy.properties.policyDefinitionId}${ID_DUPLICATE_SUFFIX}`;
  }
}

async function deleteAssignmentAndDefinitions(policyDefinitions: any[], policyAssignments: any[], azHttpClient: AzHttpClient): Promise<string[]> {
  prettyDebugLog(`Force update : Deleting Assignments`);
  let leftoutPolicyIds: string[] = [];

  // Delete assignments before definitions
  leftoutPolicyIds.push(...await deletePolicies(policyAssignments, azHttpClient));
  leftoutPolicyIds.push(...await deletePolicies(policyDefinitions, azHttpClient));

  return leftoutPolicyIds;
}

/**
 * Deletes policies from azure. Returns array containing policy ids which could not be deleted.
 */
async function deletePolicies(policies: any[], azHttpClient: AzHttpClient): Promise<string[]> {
  const policyIds: string[] = getPolicyIds(policies);
  const deletionResponse = await azHttpClient.deletePolicies(policyIds);
  return verifyPolicyDeletion(policyIds, deletionResponse);
}

/**
 * Reverts policies in service which were deleted/modified. 
 */
async function upsertOldPolicies(policyDefinitions: any[], policyAssignments: any[], azHttpClient: AzHttpClient) {
  const definitionRequests = getPolicyRequests(policyDefinitions);
  const assignmentRequests = getPolicyRequests(policyAssignments);

  await createPolicies(definitionRequests, assignmentRequests, azHttpClient);
}

/**
 * Creates definition, corresponging assignments which needed force update.
 */
async function createPoliciesFromCode(definitionRequests: PolicyRequest[], azHttpClient: AzHttpClient) {
  prettyDebugLog(`Force update : Creating policies in code`);
  const assignmentRequests = getAssignmentRequests(definitionRequests);
  const [definitionResponses, assignmentResponses] = await createPolicies(definitionRequests, assignmentRequests, azHttpClient, true);

  return [definitionResponses, assignmentRequests, assignmentResponses];
}

/**
 * Creates policy definitions and assignments. Throws in case any policy creation fails.
 * In case there is a failure while creation and 'deleteInFailure' is true then all policies are deleted.
 */
async function createPolicies(definitionRequests: PolicyRequest[], assignmentRequests: PolicyRequest[], azHttpClient: AzHttpClient, deleteInFailure: boolean = false): Promise<any[][]> {
  const definitionResponses = await azHttpClient.upsertPolicyDefinitions(definitionRequests);
  validateUpsertResponse(definitionResponses, azHttpClient, deleteInFailure);

  let assignmentResponses = await azHttpClient.upsertPolicyAssignments(assignmentRequests);
  try {
    validateUpsertResponse(assignmentResponses, azHttpClient, deleteInFailure);
  }
  catch (error) {
    if (deleteInFailure) {
      // Assignments creation failed so we need to delete all definitions.
      const definitions = getPoliciesFromResponse(definitionResponses);
      const leftoutPolicyIds = await deletePolicies(definitions, azHttpClient);
      if (leftoutPolicyIds.length > 0) {
        // TODO PM: What happens when deletion fails.
      }
    }
    throw Error(error);
  }
  
  return [definitionResponses, assignmentResponses]
}

/**
 * Validates whether upsert operation was successful for all policies.
 * Throws in case upsert failed for any one policy.
 * Delets all policies in case upsert failed for any one policy and 'deleteInFailure' parameter is true.
 */
async function validateUpsertResponse(policyResponses: any[], azHttpClient: AzHttpClient, deleteInFailure: boolean = false) {
  const policies = getPoliciesFromResponse(policyResponses);
  try {
    validatePolicies(policies);
  }
  catch (error) {
    console.log(`Error occurred while creating policies.`);
    if (deleteInFailure) {
      // delete policies which were created.
      const validPolicies = policies.filter(policy => policy.id != undefined);
      const leftoutPolicyIds = await deletePolicies(validPolicies, azHttpClient);
      if (leftoutPolicyIds.length > 0) {
        // TODO PM: What happens when deletion fails.
      }
    }
    throw Error(error);
  }
}

/**
 * Returns PolicyRequest array corresponding to the given policies.
 */
function getPolicyRequests(policies: any[]): PolicyRequest[] {
  let policyRequests: PolicyRequest[] = [];

  policies.forEach(policy => {
    policyRequests.push({
      policy: policy
    } as PolicyRequest);
  });

  return policyRequests;
}

/**
 * For given definition requests, get all assignment requests.
 */
function getAssignmentRequests(definitionRequests: PolicyRequest[]): PolicyRequest[] {
  let assignmentRequests: PolicyRequest[] = [];

  const allDefinitionsPath: string[] = definitionRequests.map(request => request.path);
  const allAssignmentsPath = getAllAssignmentInPaths(allDefinitionsPath);

  allAssignmentsPath.forEach(assignmentPath => {
    assignmentRequests.push({
      path: assignmentPath,
      operation: POLICY_OPERATION_CREATE,
      policy: getPolicyAssignment(assignmentPath)
    });
  });

  return assignmentRequests;
}

/**
 * Remove assignment requests which were already created during force update.
 */
function removeAssignmentRequests(assignmentRequests: PolicyRequest[], assignmentResponses: any[]) {
  const assignments = getPoliciesFromResponse(assignmentResponses);
  const assignmentIds: string[] = getPolicyIds(assignments);
  
  for (let index = assignmentRequests.length - 1; index >= 0; index--) {
    if (assignmentIds.includes(assignmentRequests[index].policy.id)) {
      assignmentRequests.splice(index, 1);
    }
  }
}

/**
 * For definitions which were force updated. Remove entry from original definition requests and responses to avoild false logging.
 */
function removePolicyDefinitionRequests(definitionRequests: PolicyRequest[], policyResponses: any[], badRequests: PolicyRequest[]) {
  const forcedPolicyDefinitionIds = badRequests.map(request => request.policy.id);

  for (let index = definitionRequests.length - 1; index >= 0; index--) {
    if (forcedPolicyDefinitionIds.includes(definitionRequests[index].policy.id)) {
      definitionRequests.splice(index, 1);
      policyResponses.splice(index, 1);
    }
  }
}

/**
 * Extracts policyIds from policy array.
 */
function getPolicyIds(policies: any[]): string[] {
  return policies.map(policy => policy.id);
}

/**
 * Extracts policies from batch response array.
 */
function getPoliciesFromResponse(policyResponses: any[]): any[] {
  return policyResponses.map(response => response.content);
}

/**
 * Populates result using requests and responses.
 */
function populateResults(definitionRequests: PolicyRequest[], definitionResponses: any[], assignmentRequests: PolicyRequest[], assignmentResponses: any[], policyResults: PolicyResult[]) {
  let definitionResults = getPolicyResults(definitionRequests, definitionResponses, DEFINITION_TYPE);
  let assignmentResults = getPolicyResults(assignmentRequests, assignmentResponses, ASSIGNMENT_TYPE);

  definitionResults.forEach(result => {
    result.operation = POLICY_OPERATION_FORCE_UPDATE;
  });

  assignmentResults.forEach(result => {
    result.operation = POLICY_OPERATION_FORCE_CREATE;
  });

  policyResults.push(...definitionResults, ...assignmentResults);
}

/**
 * Checks whether policies are valid or not.
 */
function validatePolicies(policies: any[]) {
  policies.forEach(policy => {
    if (!policy.id || !policy.name || !policy.type) {
      const message = policy.error && policy.error.message ? policy.error.message : 'Policy is invalid';
      throw Error(message);
    }
  });
}

/**
 * Verifies whether all deletion response are successful. Returns policyIds which were not deleted.
 */
function verifyPolicyDeletion(policyIds: string[], deletionResponses : any[]): string[] {
  let leftoutPolicyIds: string[] = [];

  deletionResponses.forEach((response, index) => {
    if (response.httpStatusCode != StatusCodes.OK) {
      leftoutPolicyIds.push(policyIds[index]);
    }
  });

  return leftoutPolicyIds;
}