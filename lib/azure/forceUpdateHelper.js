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
exports.handleForceUpdate = void 0;
const httpClient_1 = require("../utils/httpClient");
const policyHelper_1 = require("./policyHelper");
const utilities_1 = require("../utils/utilities");
const pathHelper_1 = require("../inputProcessing/pathHelper");
const azHttpClient_1 = require("./azHttpClient");
const DUPLICATE_SUFFIX = "_84WCDn7pF0KY5Werq3iPqA"; // Short GUID
function handleForceUpdate(definitionRequests, policyResponses, assignmentRequests) {
    return __awaiter(this, void 0, void 0, function* () {
        let badRequests = filterBadRequests(definitionRequests, policyResponses);
        if (badRequests.length > 0) {
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            // Get all assignments from Azure
            const policyDefinitionIds = badRequests.map(request => request.policy.id);
            let allDefinitionAssignments = yield getAllDefinitionsAssignment(policyDefinitionIds, azHttpClient);
            // Check if all assignments are present in repo
            if (checkAssignmentsExists(badRequests, allDefinitionAssignments)) {
                utilities_1.prettyLog(`All assignments are present. We will proceed with force update.`);
                // Get all assignments in one array
                let allAssignments = [].concat(...allDefinitionAssignments);
                // Duplicate definitions and assignments in Azure before deletion
                yield createDuplicatePolicies(policyDefinitionIds, allAssignments, azHttpClient);
                // Delete policies in Azure
                yield deleteOldPolicies(policyDefinitionIds, allAssignments, azHttpClient);
                // TODO : In case deletion fails : we need to recover all policies which were deleted and delete duplicate ones.
                // Create Updated definition
                // Create New Assignments
            }
            else {
                utilities_1.prettyLog(`Cannot force update as some assignments are missing in code.`);
            }
        }
        else {
            utilities_1.prettyDebugLog(`No definition needs to be force updated`);
        }
    });
}
exports.handleForceUpdate = handleForceUpdate;
function checkAssignmentsExists(definitionRequests, allDefinitionAssignments) {
    let allAssignmentsArePresent = true;
    definitionRequests.forEach((definitionRequest, index) => {
        const assignmentsInCodePath = pathHelper_1.getAllAssignmentPathForDefinition(definitionRequest.path);
        const assignmentsInCode = policyHelper_1.getPolicyAssignments(assignmentsInCodePath);
        const assignmentsInService = allDefinitionAssignments[index];
        if (!areAllAssignmentInCode(assignmentsInCode, assignmentsInService)) {
            allAssignmentsArePresent = false;
            utilities_1.prettyLog(`1 or more assignments are missing for definition id : ${definitionRequest.policy.id}`);
        }
    });
    return allAssignmentsArePresent;
}
// Checks if all assignment in service are present in code.
function areAllAssignmentInCode(assignmentsInCode, assignmentsInService) {
    if (assignmentsInCode.length < assignmentsInService.length) {
        return false;
    }
    const assignmentsInCodeIds = assignmentsInCode.map(assignment => assignment.id);
    const assignmentsInServiceIds = assignmentsInService.map(assignment => assignment.id);
    return assignmentsInServiceIds.every(assignmentId => assignmentsInCodeIds.includes(assignmentId));
}
function filterBadRequests(policyRequests, policyResponses) {
    let badRequests = [];
    policyRequests.forEach((policyRequest, index) => {
        const policyResponse = policyResponses[index];
        // We will only consider bad request in case of update.
        if (policyRequest.operation == policyHelper_1.POLICY_OPERATION_UPDATE && policyResponse.httpStatusCode == httpClient_1.StatusCodes.BAD_REQUEST) {
            badRequests.push(policyRequest);
        }
    });
    return badRequests;
}
function getAllDefinitionsAssignment(policyDefinitionIds, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        const responses = yield azHttpClient.getAllAssignments(policyDefinitionIds);
        // Check if all request are successful
        responses.forEach(response => {
            if (response.httpStatusCode != httpClient_1.StatusCodes.OK) {
                const message = response.content.error ? response.content.error.message : 'Error while getting assignments';
                throw Error(message);
            }
        });
        return responses.map(response => response.content.value);
    });
}
function createDuplicatePolicies(policyDefinitionIds, policyAssignments, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        // We need to get existing definitions from Azure.
        let policyDefinitions = yield azHttpClient.getPolicyDefintions(policyDefinitionIds);
        const duplicateDefinitionRequests = createDuplicateRequests(policyDefinitions);
        yield createDuplicateDefinitions(duplicateDefinitionRequests, azHttpClient);
        const duplicateAssignmentRequests = createDuplicateRequests(policyAssignments);
        yield createDuplicateAssignments(duplicateAssignmentRequests, azHttpClient);
    });
}
function createDuplicateRequests(policies) {
    let policyRequests = [];
    policies.forEach(policy => {
        appendDuplicateSuffix(policy);
        policyRequests.push({
            path: "NA",
            operation: policyHelper_1.POLICY_OPERATION_CREATE,
            policy: policy
        });
    });
    return policyRequests;
}
function createDuplicateDefinitions(policyRequests, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        const definitionResponses = yield azHttpClient.upsertPolicyDefinitions(policyRequests);
        // TODO : Check response for failure, throw in case of failure
    });
}
function createDuplicateAssignments(policyRequests, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        const assignmentResponses = yield azHttpClient.upsertPolicyAssignments(policyRequests);
        // TODO : Check response for failure, throw in case of failure
    });
}
function appendDuplicateSuffix(policy) {
    policy.id = `${policy.id}${DUPLICATE_SUFFIX}`;
    policy.name = `${policy.name}${DUPLICATE_SUFFIX}`;
    // For policy assignment
    if (policy.properties.policyDefinitionId) {
        policy.properties.policyDefinitionId = `${policy.properties.policyDefinitionId}${DUPLICATE_SUFFIX}`;
    }
}
function deleteOldPolicies(policyDefinitionIds, policyAssignments, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        // Delete assignments before definitions
        let allAssignmentIds = policyAssignments.map(assignment => assignment.id);
        const assignmentDeleteResponse = yield azHttpClient.deletePolicyAssignments(allAssignmentIds);
        // TODO : verify response.
        const definitionsDeleteResponse = yield azHttpClient.deletePolicyDefinitions(policyDefinitionIds);
        // TODO verify response.
    });
}
