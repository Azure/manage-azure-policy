import { StatusCodes } from "../utils/httpClient";
import { POLICY_OPERATION_CREATE, POLICY_OPERATION_UPDATE, PolicyRequest, getPolicyAssignments  } from './policyHelper'
import { prettyDebugLog, prettyLog } from '../utils/utilities'
import { getAllAssignmentPathForDefinition } from '../inputProcessing/pathHelper';
import { AzHttpClient } from './azHttpClient';

const DUPLICATE_SUFFIX = "_84WCDn7pF0KY5Werq3iPqA"; // Short GUID

export async function handleForceUpdate(definitionRequests: PolicyRequest[], policyResponses: any[], assignmentRequests: PolicyRequest[]) {
  let badRequests: PolicyRequest[] = filterBadRequests(definitionRequests, policyResponses);

  if (badRequests.length > 0) {
    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();

    // Get all assignments from Azure
    const policyDefinitionIds: string[] = badRequests.map(request => request.policy.id);
    let allDefinitionAssignments: any[][] = await getAllDefinitionsAssignment(policyDefinitionIds, azHttpClient);

    // Check if all assignments are present in repo
    if (checkAssignmentsExists(badRequests, allDefinitionAssignments)) {
      prettyLog(`All assignments are present. We will proceed with force update.`);

      // Get all assignments in one array
      let allAssignments: any[] = [].concat(...allDefinitionAssignments);

      // Duplicate definitions and assignments in Azure before deletion
      await createDuplicatePolicies(policyDefinitionIds, allAssignments, azHttpClient);

      // Delete policies in Azure
      await deleteOldPolicies(policyDefinitionIds, allAssignments, azHttpClient);
      // TODO : In case deletion fails : we need to recover all policies which were deleted and delete duplicate ones.


      // Create Updated definition

      // Create New Assignments
      
    }
    else {
      prettyLog(`Cannot force update as some assignments are missing in code.`);
    }
  }
  else {
    prettyDebugLog(`No definition needs to be force updated`);
  }
}
  
function checkAssignmentsExists(definitionRequests: PolicyRequest[], allDefinitionAssignments: any[][]): boolean {
  let allAssignmentsArePresent: boolean = true;

  definitionRequests.forEach((definitionRequest, index) => {
    const assignmentsInCodePath = getAllAssignmentPathForDefinition(definitionRequest.path);
    const assignmentsInCode = getPolicyAssignments(assignmentsInCodePath);
    const assignmentsInService = allDefinitionAssignments[index];

    if (!areAllAssignmentInCode(assignmentsInCode, assignmentsInService)) {
      allAssignmentsArePresent = false;
      prettyLog(`1 or more assignments are missing for definition id : ${definitionRequest.policy.id}`);
    }
  });

  return allAssignmentsArePresent;
}
  
// Checks if all assignment in service are present in code.
function areAllAssignmentInCode(assignmentsInCode: any[], assignmentsInService: any[]): boolean {
  if (assignmentsInCode.length < assignmentsInService.length) {
    return false;
  } 

  const assignmentsInCodeIds: string[] = assignmentsInCode.map(assignment => assignment.id);
  const assignmentsInServiceIds: string[] = assignmentsInService.map(assignment => assignment.id);

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

async function createDuplicatePolicies(policyDefinitionIds: string[], policyAssignments: any[], azHttpClient: AzHttpClient) {
  // We need to get existing definitions from Azure.
  let policyDefinitions = await azHttpClient.getPolicyDefintions(policyDefinitionIds);
  
  const duplicateDefinitionRequests = createDuplicateRequests(policyDefinitions);
  await createDuplicateDefinitions(duplicateDefinitionRequests, azHttpClient);

  const duplicateAssignmentRequests = createDuplicateRequests(policyAssignments);
  await createDuplicateAssignments(duplicateAssignmentRequests, azHttpClient);
}

function createDuplicateRequests(policies: any[]): PolicyRequest[] {
  let policyRequests: PolicyRequest[] = [];

  policies.forEach(policy => {
    // Clone the policy object
    let policyClone = JSON.parse(JSON.stringify(policy))
    appendDuplicateSuffix(policyClone);

    policyRequests.push({
      path: "NA",
      operation: POLICY_OPERATION_CREATE,
      policy: policyClone
    });
  });

  return policyRequests;
}

async function createDuplicateDefinitions(policyRequests: PolicyRequest[], azHttpClient: AzHttpClient) {
  prettyDebugLog(`Creating Duplicate definitions`);
  const definitionResponses = await azHttpClient.upsertPolicyDefinitions(policyRequests);

  // TODO : Check response for failure, throw in case of failure
}

async function createDuplicateAssignments(policyRequests: PolicyRequest[], azHttpClient: AzHttpClient) {
  prettyDebugLog(`Creating Duplicate assignments`);
  const assignmentResponses = await azHttpClient.upsertPolicyAssignments(policyRequests);

  // TODO : Check response for failure, throw in case of failure
}

function appendDuplicateSuffix(policy: any) {
  policy.id = `${policy.id}${DUPLICATE_SUFFIX}`;
  policy.name = `${policy.name}${DUPLICATE_SUFFIX}`;

  // For policy assignment
  if (policy.properties.policyDefinitionId) {
      policy.properties.policyDefinitionId = `${policy.properties.policyDefinitionId}${DUPLICATE_SUFFIX}`;
  }
}

async function deleteOldPolicies(policyDefinitionIds: string[], policyAssignments: any[], azHttpClient: AzHttpClient) {
  prettyDebugLog(`Deleting Assignments`);

  // Delete assignments before definitions
  let allAssignmentIds: string[] = policyAssignments.map(assignment => assignment.id);
  const assignmentDeleteResponse = await azHttpClient.deletePolicyAssignments(allAssignmentIds);

  // TODO : verify response.

  prettyDebugLog(`Deleting Definitions`);
  const definitionsDeleteResponse = await azHttpClient.deletePolicyDefinitions(policyDefinitionIds);

  // TODO verify response.
}