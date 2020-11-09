"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignRoles = exports.POLICY_OPERATION_FORCE_CREATE = exports.POLICY_OPERATION_FORCE_UPDATE = void 0;
const httpClient_1 = require("../utils/httpClient");
const policyHelper_1 = require("./policyHelper");
const utilities_1 = require("../utils/utilities");
const azHttpClient_1 = require("./azHttpClient");
const uuid_1 = require("uuid");
exports.POLICY_OPERATION_FORCE_UPDATE = "FORCE_UPDATE";
exports.POLICY_OPERATION_FORCE_CREATE = "FORCE_CREATE";
function assignRoles(assignmentRequests, assignmentResponses, roleAssignmentResults) {
    return __awaiter(this, void 0, void 0, function* () {
        let filteredAssignments = filterIdentityAssignments(assignmentRequests, assignmentResponses);
        let allRoleDefinitions = yield paresRoleDefinitions(filteredAssignments, roleAssignmentResults);
        let roleRequests = getRoleRequests(filteredAssignments, allRoleDefinitions);
        yield createRoles(roleRequests, roleAssignmentResults);
    });
}
exports.assignRoles = assignRoles;
function filterIdentityAssignments(assignmentRequests, assignmentResponses) {
    let filteredAssignments = [];
    assignmentRequests.forEach((assignmentRequest, index) => {
        let assignmentResponse = assignmentResponses[index].content;
        // We will assign roles only when assignmnet was created and has identity field has principalId in it.
        if (policyHelper_1.isCreateOperation(assignmentRequest) && assignmentResponse.identity && assignmentResponse.identity.principalId) {
            // We will add path in assignment as it is required later.
            assignmentResponse.path = assignmentRequest.path;
            filteredAssignments.push(assignmentResponse);
        }
    });
    return filteredAssignments;
}
function paresRoleDefinitions(policyAssignments, roleAssignmentResults) {
    return __awaiter(this, void 0, void 0, function* () {
        let roleDefinitions = {};
        const policyDefinitionIds = policyAssignments.map(assignment => assignment.properties.policyDefinitionId);
        try {
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            let policyDefinitions = yield azHttpClient.getPolicyDefintions(policyDefinitionIds);
            policyDefinitions.forEach((definition, index) => {
                if (definition.error) {
                    let policyAssignment = policyAssignments[index];
                    let message = definition.error.message ? definition.error.message : "Could not get policy definition from Azure";
                    roleAssignmentResults.push(getRoleAssignmentResult(policyAssignment.path, policyAssignment.id, policyAssignment.properties.policyDefinitionId, policyHelper_1.POLICY_RESULT_FAILED, message));
                }
                else {
                    let roleDefinitionIds = getRoleDefinitionIds(definition);
                    if (roleDefinitionIds && roleDefinitionIds.length > 0) {
                        // We need last part of role definition id 
                        roleDefinitions[definition.id] = roleDefinitionIds.map(roleDefinitionId => roleDefinitionId.split("/").pop());
                    }
                    else {
                        utilities_1.prettyLog(`Could not find role definition ids for adding role assignments to the managed identity. Definition Id : ${definition.id}`);
                    }
                }
            });
        }
        catch (error) {
            utilities_1.prettyDebugLog(`An error occurred while getting role requests for missing policy definitions. Error : ${error}`);
            throw new Error(`An error occurred while getting role requests for missing policy definitions. Error: ${error}`);
        }
        return roleDefinitions;
    });
}
function createRoles(roleRequests, roleAssignmentResults) {
    return __awaiter(this, void 0, void 0, function* () {
        if (roleRequests.length == 0) {
            utilities_1.prettyDebugLog(`No role assignments needs to be created`);
            return;
        }
        try {
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            let responses = yield azHttpClient.addRoleAssinments(roleRequests);
            responses.forEach((response, index) => {
                let roleRequest = roleRequests[index];
                let message = `Role Assignment created with id : ${response.content.id}`;
                let status = policyHelper_1.POLICY_RESULT_SUCCEEDED;
                if (response.httpStatusCode == httpClient_1.StatusCodes.CREATED) {
                    utilities_1.prettyDebugLog(`Role assignment created with id ${response.content.id} for assignmentId : ${roleRequest.policyAssignmentId}`);
                }
                else {
                    utilities_1.prettyLog(`Role assignment could not be created related to assignment id ${roleRequest.policyAssignmentId}. Status : ${response.httpStatusCode}`);
                    message = response.content.error ? response.content.error.message : `Role Assignment could not be created. Status : ${response.httpStatusCode}`;
                    status = policyHelper_1.POLICY_RESULT_FAILED;
                }
                roleAssignmentResults.push(getRoleAssignmentResult(roleRequest.path, roleRequest.policyAssignmentId, roleRequest.policyDefinitionId, status, message));
            });
        }
        catch (error) {
            utilities_1.prettyLog(`An error occurred while creating role assignments. Error: ${error}`);
            throw new Error(`An error occurred while creating role assignments. Error: ${error}`);
        }
    });
}
function getRoleRequests(policyAssignments, allRoleDefinitions) {
    let roleRequests = [];
    policyAssignments.forEach(policyAssignment => {
        let roleDefinitions = allRoleDefinitions[policyAssignment.properties.policyDefinitionId];
        if (roleDefinitions) {
            roleDefinitions.forEach(roleId => {
                roleRequests.push({
                    scope: policyAssignment.properties.scope,
                    roleAssignmentId: uuid_1.v4(),
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
function getRoleAssignmentResult(path, assignmentId, definitionId, status, message) {
    return {
        path: path,
        type: policyHelper_1.ROLE_ASSIGNMNET_TYPE,
        operation: policyHelper_1.POLICY_OPERATION_CREATE,
        displayName: `Role Assignment for policy policy assignment id : ${assignmentId}`,
        status: status,
        message: message,
        policyDefinitionId: definitionId
    };
}
function getRoleDefinitionIds(policyDefinition) {
    if (policyDefinition.properties
        && policyDefinition.properties.policyRule
        && policyDefinition.properties.policyRule.then
        && policyDefinition.properties.policyRule.then.details
        && policyDefinition.properties.policyRule.then.details.roleDefinitionIds) {
        return policyDefinition.properties.policyRule.then.details.roleDefinitionIds;
    }
    return undefined;
}
