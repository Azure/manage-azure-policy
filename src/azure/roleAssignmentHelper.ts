import { StatusCodes } from "../utils/httpClient";
import { POLICY_OPERATION_CREATE, POLICY_RESULT_FAILED, POLICY_RESULT_SUCCEEDED, ROLE_ASSIGNMNET_TYPE, PolicyRequest, PolicyResult, isCreateOperation } from './policyHelper'
import { prettyDebugLog, prettyLog } from '../utils/utilities'
import { AzHttpClient } from './azHttpClient';
import { v4 as uuidv4 } from 'uuid';

export const POLICY_OPERATION_FORCE_UPDATE = "FORCE_UPDATE";
export const POLICY_OPERATION_FORCE_CREATE = "FORCE_CREATE";

export interface RoleRequest {
    scope: string;
    roleAssignmentId: string;
    roleDefinitionId: string;
    principalId: string;
    policyAssignmentId: string;
    policyDefinitionId: string;
    path: string;
}

export async function assignRoles(assignmentRequests: PolicyRequest[], assignmentResponses: any[], roleAssignmentResults: PolicyResult[]) {
    let filteredAssignments = filterIdentityAssignments(assignmentRequests, assignmentResponses);
    let allRoleDefinitions = await paresRoleDefinitions(filteredAssignments, roleAssignmentResults);
    let roleRequests: RoleRequest[] = getRoleRequests(filteredAssignments, allRoleDefinitions);

    await createRoles(roleRequests, roleAssignmentResults);
}

function filterIdentityAssignments(assignmentRequests: PolicyRequest[], assignmentResponses: any[]): any[] {
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
            roleAssignmentResults.push(getRoleAssignmentResult(roleRequest.path, roleRequest.policyAssignmentId, roleRequest.policyDefinitionId, status, message));
        });
    }
    catch (error) {
        prettyLog(`An error occurred while creating role assignments. Error: ${error}`);
        throw new Error(`An error occurred while creating role assignments. Error: ${error}`);
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

function getRoleDefinitionIds(policyDefinition: any): string[] {
    if (policyDefinition.properties
        && policyDefinition.properties.policyRule
        && policyDefinition.properties.policyRule.then
        && policyDefinition.properties.policyRule.then.details
        && policyDefinition.properties.policyRule.then.details.roleDefinitionIds) {
        return policyDefinition.properties.policyRule.then.details.roleDefinitionIds;
    }

    return undefined;
}