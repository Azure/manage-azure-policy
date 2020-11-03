import { StatusCodes } from "../utils/httpClient";
import { POLICY_OPERATION_CREATE, POLICY_OPERATION_UPDATE, PolicyRequest, getPolicyAssignment, getPolicyAssignments  } from './policyHelper'
import { prettyDebugLog, prettyLog } from '../utils/utilities'
import { getAllAssignmentInPaths } from '../inputProcessing/pathHelper';
import { AzHttpClient } from './azHttpClient';
import { request } from "http";
import { assignments } from "../inputProcessing/inputs";

const ID_DUPLICATE_SUFFIX = "_84WCDn7pF0KY5Werq3iPqA"; // Short GUID
const DISPLAY_NAME_DUPLICATE_SUFFIX = " - Duplicate";

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
      const [duplicateDefinitions, duplicateAssignments] = await createDuplicatePolicies(policyDefinitionIds, allAssignments, azHttpClient);

      // Delete policies in Azure
      await deleteOldPolicies(policyDefinitionIds, allAssignments, azHttpClient);
      // TODO : In case deletion fails : we need to recover all policies which were deleted and delete duplicate ones.

      // Create policies again
      await createOriginalPolicies(badRequests, azHttpClient);

      // Delete duplicate policies
      await deleteDuplicatePolicies(duplicateDefinitions, duplicateAssignments, azHttpClient);
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
    const assignmentsInCodePath = getAllAssignmentInPaths([definitionRequest.path]);
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

async function createDuplicatePolicies(policyDefinitionIds: string[], policyAssignments: any[], azHttpClient: AzHttpClient): Promise<any[][]> {
  // We need to get existing definitions from Azure.
  let policyDefinitions = await azHttpClient.getPolicyDefintions(policyDefinitionIds);
  
  const duplicateDefinitionRequests = createDuplicateRequests(policyDefinitions);
  const duplicateDefinitions: any[] = await createDuplicateDefinitions(duplicateDefinitionRequests, azHttpClient);

  const duplicateAssignmentRequests = createDuplicateRequests(policyAssignments);
  const duplicateAssignments: any[] = await createDuplicateAssignments(duplicateAssignmentRequests, azHttpClient);

  return [duplicateDefinitions, duplicateAssignments];
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

async function createDuplicateDefinitions(policyRequests: PolicyRequest[], azHttpClient: AzHttpClient): Promise<any[]> {
  prettyDebugLog(`Force update : Creating Duplicate definitions`);
  const definitionResponses = await azHttpClient.upsertPolicyDefinitions(policyRequests);

  // TODO : Check response for failure, throw in case of failure

  return definitionResponses.map(response => response.content);
}

async function createDuplicateAssignments(policyRequests: PolicyRequest[], azHttpClient: AzHttpClient): Promise<any[]> {
  prettyDebugLog(`Force update : Creating Duplicate assignments`);
  const assignmentResponses = await azHttpClient.upsertPolicyAssignments(policyRequests);

  // TODO : Check response for failure, throw in case of failure
  return assignmentResponses.map(response => response.content);
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

async function deleteOldPolicies(policyDefinitionIds: string[], policyAssignments: any[], azHttpClient: AzHttpClient) {
  prettyDebugLog(`Force update : Deleting Assignments`);

  // Delete assignments before definitions
  let allAssignmentIds: string[] = policyAssignments.map(assignment => assignment.id);
  const assignmentDeleteResponse = await azHttpClient.deletePolicyAssignments(allAssignmentIds);

  // TODO : verify response.

  prettyDebugLog(`Force update : Deleting Definitions`);
  const definitionsDeleteResponse = await azHttpClient.deletePolicyDefinitions(policyDefinitionIds);

  // TODO verify response.
}

async function deleteDuplicatePolicies(duplicateDefinitions: any[], duplicateAssignments: any[], azHttpClient: AzHttpClient) {
  const duplicateAssignmentIds = duplicateAssignments.map(assignment => assignment.id);
  const duplicateDefinitionIds = duplicateDefinitions.map(definition => definition.id);

  prettyDebugLog(`Force update : Deleting duplicate assignments`);
  const assignmentDeleteResponse = await azHttpClient.deletePolicyAssignments(duplicateAssignmentIds);
  // TODO: verify deletion

  prettyDebugLog(`Force update : Deleting duplicate definitions`);
  const definitionsDeleteResponse = await azHttpClient.deletePolicyDefinitions(duplicateDefinitionIds);
  // TODO: verify deletion
}

async function createOriginalPolicies(definitionRequests: PolicyRequest[], azHttpClient: AzHttpClient) {
  // Create definitions
  prettyDebugLog(`Force update : Creating original definitions`);
  let definitionsResponse = await azHttpClient.upsertPolicyDefinitions(definitionRequests);
  // TODO : Validate response

  // Create assignments
  prettyDebugLog(`Force update : Creating original assignments`);
  const assignmentRequests = getAssignmentRequests(definitionRequests);
  let assignmentsResponse = await azHttpClient.upsertPolicyAssignments(assignmentRequests);
  // TODO : Validate Assignments
}

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