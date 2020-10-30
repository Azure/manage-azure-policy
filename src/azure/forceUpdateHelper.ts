import { StatusCodes } from "../utils/httpClient";
import { POLICY_OPERATION_UPDATE, PolicyRequest, getPolicyAssignments  } from './policyHelper'
import { prettyDebugLog, prettyLog } from '../utils/utilities'
import { getAllAssignmentPathForDefinition } from '../inputProcessing/pathHelper';
import { AzHttpClient } from './azHttpClient';

export async function handleForceUpdate(definitionRequests: PolicyRequest[], policyResponses: any[], assignmentRequests: PolicyRequest[]) {
    let badRequests: PolicyRequest[] = filterBadRequests(definitionRequests, policyResponses);
  
    if (badRequests.length > 0) {
      // Get all assignments from azure
      let allDefinitionAssignments: any[] = await getAllDefinitionsAssignment(badRequests.map(request => request.policy.id));
  
      // Check if all assignments are present in repo
      if (checkAssignmentsExists(badRequests, allDefinitionAssignments)) {
        prettyLog(`All assignments are present. We will proceed with force update.`);
        
      }
      else {
        prettyLog(`Cannot force update as some assignments are missing in code.`);
      }
    }
    else {
      prettyDebugLog(`No definition needs to be force updated`);
    }
  }
  
  function checkAssignmentsExists(definitionRequests: PolicyRequest[], allDefinitionAssignments: any[]): boolean {
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
  
  async function getAllDefinitionsAssignment(policyDefinitionIds: string[]): Promise<any[]> {
    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();
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