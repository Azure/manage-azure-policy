"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.handleForceUpdate = exports.POLICY_OPERATION_FORCE_CREATE = exports.POLICY_OPERATION_FORCE_UPDATE = void 0;
const core = __importStar(require("@actions/core"));
const httpClient_1 = require("../utils/httpClient");
const policyHelper_1 = require("./policyHelper");
const utilities_1 = require("../utils/utilities");
const pathHelper_1 = require("../inputProcessing/pathHelper");
const azHttpClient_1 = require("./azHttpClient");
exports.POLICY_OPERATION_FORCE_UPDATE = "FORCE_UPDATE";
exports.POLICY_OPERATION_FORCE_CREATE = "FORCE_CREATE";
const ID_DUPLICATE_SUFFIX = "_84WCDn7pF0KY5Werq3iPqA"; // Short GUID
const DISPLAY_NAME_DUPLICATE_SUFFIX = " - Duplicate";
function handleForceUpdate(definitionRequests, policyResponses, assignmentRequests, policyResults) {
    return __awaiter(this, void 0, void 0, function* () {
        let badRequests = filterBadRequests(definitionRequests, policyResponses);
        if (badRequests.length > 0) {
            utilities_1.prettyLog("ForceUpdate : Start");
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            const policyDefinitionIds = badRequests.map(request => request.policy.id);
            let allDefinitionAssignments;
            let definitionsInService;
            // Get all definitions and assignments from Azure
            try {
                allDefinitionAssignments = yield getAllDefinitionsAssignment(policyDefinitionIds, azHttpClient);
                definitionsInService = yield azHttpClient.getPolicyDefintions(policyDefinitionIds);
                validatePolicies(definitionsInService);
            }
            catch (error) {
                utilities_1.prettyLog(`Could not get assignments or definitions from azure. Abandoning force update. Error : ${error}`);
                return;
            }
            // Check if all assignments are present in repo
            if (checkAssignmentsExists(badRequests, allDefinitionAssignments)) {
                console.log(`All assignments are present. We will proceed with force update.`);
                // Get all assignments in one array
                let assignmentsInService = [].concat(...allDefinitionAssignments);
                let repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses;
                try {
                    [repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses] = yield startForceUpdate(badRequests, definitionsInService, assignmentsInService, azHttpClient);
                }
                catch (error) {
                    utilities_1.prettyLog(`ForceUpdate Failed. Error : ${error}`);
                    return;
                }
                // Need to avoid duplicate updation so we will remove entries from definitionRequests and assignmentRequests.
                removePolicyDefinitionRequests(definitionRequests, policyResponses, badRequests);
                removeAssignmentRequests(assignmentRequests, repoAssignmentResponses);
                // Populate results
                populateResults(badRequests, repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses, policyResults);
                utilities_1.prettyLog("ForceUpdate : End");
            }
            else {
                console.log(`Cannot force update as some assignments are missing in code.`);
            }
        }
        else {
            utilities_1.prettyDebugLog(`No definition needs to be force updated`);
        }
    });
}
exports.handleForceUpdate = handleForceUpdate;
function startForceUpdate(badRequests, definitionsInService, assignmentsInService, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        let duplicateDefinitions, duplicateAssignments;
        // Duplicate definitions and assignments in Azure before deletion
        try {
            [duplicateDefinitions, duplicateAssignments] = yield createDuplicatePolicies(definitionsInService, assignmentsInService, azHttpClient);
        }
        catch (error) {
            console.log(`Error occurred while creating duplicate policies. Abandoning force update. Error : ${error}`);
            throw Error(error);
        }
        // Delete policies in Azure
        const leftoutPolicyIdsInService = yield deleteAssignmentAndDefinitions(definitionsInService, assignmentsInService, azHttpClient);
        if (leftoutPolicyIdsInService.length > 0) {
            console.log(`Deletion of existing policies in Azure failed. Abandoning force update`);
            yield revertOldPoliciesAndDeleteDuplicates(definitionsInService, assignmentsInService, duplicateDefinitions, duplicateAssignments, azHttpClient);
            throw Error(`Deletion of existing policies in Azure failed.`);
        }
        // Create fresh policies from repo
        let repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses;
        try {
            [repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses] = yield createPoliciesFromCode(badRequests, azHttpClient);
        }
        catch (error) {
            console.log(`Error occurred while creating policies from code. Abandoning force update. Error : ${error}`);
            // Could not create policies from code. Will revert policies in service
            yield revertOldPoliciesAndDeleteDuplicates(definitionsInService, assignmentsInService, duplicateDefinitions, duplicateAssignments, azHttpClient);
            throw Error(error);
        }
        // Delete duplicate policies
        const leftoutDuplicatePolicyIds = yield deleteAssignmentAndDefinitions(duplicateDefinitions, duplicateAssignments, azHttpClient);
        if (leftoutDuplicatePolicyIds.length > 0) {
            console.log(`Could not delete duplicate policies.`);
            // TODO PM: what to do now? policies are updated but duplicates could not be deleted.
        }
        return [repoDefinitionResponses, repoAssignmentRequests, repoAssignmentResponses];
    });
}
function revertOldPoliciesAndDeleteDuplicates(definitions, assignments, duplicateDefinitions, duplicateAssignments, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield upsertOldPolicies(definitions, assignments, azHttpClient);
        }
        catch (error) {
            console.log(`Could not upsert old policies.`);
            // TODO PM: What to do now ? we have some of the old policies and all duplicate policies in azure.
            return;
        }
        // Old policies are reverted. Now delete duplicate definitions
        const leftoutDuplicatePolicyIds = yield deleteAssignmentAndDefinitions(duplicateDefinitions, duplicateAssignments, azHttpClient);
        if (leftoutDuplicatePolicyIds.length > 0) {
            console.log(`Could not delete duplicate policies.`);
            // TODO PM: What to do now? Old policies are there and some duplicates are also there.
        }
    });
}
function checkAssignmentsExists(definitionRequests, allDefinitionAssignments) {
    let allAssignmentsArePresent = true;
    definitionRequests.forEach((definitionRequest, index) => {
        const assignmentsInCodePath = pathHelper_1.getAllAssignmentInPaths([definitionRequest.path]);
        const assignmentsInCode = policyHelper_1.getPolicyAssignments(assignmentsInCodePath);
        const assignmentsInService = allDefinitionAssignments[index];
        if (!areAllAssignmentInCode(assignmentsInCode, assignmentsInService)) {
            allAssignmentsArePresent = false;
            console.log(`1 or more assignments are missing for definition id : ${definitionRequest.policy.id}`);
        }
    });
    return allAssignmentsArePresent;
}
function areAllAssignmentInCode(assignmentsInCode, assignmentsInService) {
    if (assignmentsInCode.length < assignmentsInService.length) {
        return false;
    }
    const assignmentsInCodeIds = getPolicyIds(assignmentsInCode);
    const assignmentsInServiceIds = getPolicyIds(assignmentsInService);
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
function createDuplicatePolicies(policyDefinitions, policyAssignments, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug('Force Update : Creating Duplicate Policies');
        const duplicateDefinitionRequests = createDuplicateRequests(policyDefinitions);
        const duplicateAssignmentRequests = createDuplicateRequests(policyAssignments);
        const [duplicateDefinitionsResponses, duplicateAssignmentsResponses] = yield createPolicies(duplicateDefinitionRequests, duplicateAssignmentRequests, azHttpClient, true);
        return [getPoliciesFromResponse(duplicateDefinitionsResponses), getPoliciesFromResponse(duplicateAssignmentsResponses)];
    });
}
function createDuplicateRequests(policies) {
    let policyRequests = [];
    policies.forEach(policy => {
        // Clone the policy object
        let policyClone = JSON.parse(JSON.stringify(policy));
        appendDuplicateSuffix(policyClone);
        policyRequests.push({
            path: "NA",
            operation: policyHelper_1.POLICY_OPERATION_CREATE,
            policy: policyClone
        });
    });
    return policyRequests;
}
function appendDuplicateSuffix(policy) {
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
function deleteAssignmentAndDefinitions(policyDefinitions, policyAssignments, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        utilities_1.prettyDebugLog(`Force update : Deleting Assignments`);
        let leftoutPolicyIds = [];
        // Delete assignments before definitions
        leftoutPolicyIds.push(...yield deletePolicies(policyAssignments, azHttpClient));
        leftoutPolicyIds.push(...yield deletePolicies(policyDefinitions, azHttpClient));
        return leftoutPolicyIds;
    });
}
/**
 * Deletes policies from azure. Returns array containing policy ids which could not be deleted.
 */
function deletePolicies(policies, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        const policyIds = getPolicyIds(policies);
        const deletionResponse = yield azHttpClient.deletePolicies(policyIds);
        return verifyPolicyDeletion(policyIds, deletionResponse);
    });
}
/**
 * Reverts policies in service which were deleted/modified.
 */
function upsertOldPolicies(policyDefinitions, policyAssignments, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        const definitionRequests = getPolicyRequests(policyDefinitions);
        const assignmentRequests = getPolicyRequests(policyAssignments);
        yield createPolicies(definitionRequests, assignmentRequests, azHttpClient);
    });
}
/**
 * Creates definition, corresponging assignments which needed force update.
 */
function createPoliciesFromCode(definitionRequests, azHttpClient) {
    return __awaiter(this, void 0, void 0, function* () {
        utilities_1.prettyDebugLog(`Force update : Creating policies in code`);
        const assignmentRequests = getAssignmentRequests(definitionRequests);
        const [definitionResponses, assignmentResponses] = yield createPolicies(definitionRequests, assignmentRequests, azHttpClient, true);
        return [definitionResponses, assignmentRequests, assignmentResponses];
    });
}
/**
 * Creates policy definitions and assignments. Throws in case any policy creation fails.
 * In case there is a failure while creation and 'deleteInFailure' is true then all policies are deleted.
 */
function createPolicies(definitionRequests, assignmentRequests, azHttpClient, deleteInFailure = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const definitionResponses = yield azHttpClient.upsertPolicyDefinitions(definitionRequests);
        validateUpsertResponse(definitionResponses, azHttpClient, deleteInFailure);
        let assignmentResponses = yield azHttpClient.upsertPolicyAssignments(assignmentRequests);
        try {
            validateUpsertResponse(assignmentResponses, azHttpClient, deleteInFailure);
        }
        catch (error) {
            if (deleteInFailure) {
                // Assignments creation failed so we need to delete all definitions.
                const definitions = getPoliciesFromResponse(definitionResponses);
                const leftoutPolicyIds = yield deletePolicies(definitions, azHttpClient);
                if (leftoutPolicyIds.length > 0) {
                    // TODO PM: What happens when deletion fails.
                }
            }
            throw Error(error);
        }
        return [definitionResponses, assignmentResponses];
    });
}
/**
 * Validates whether upsert operation was successful for all policies.
 * Throws in case upsert failed for any one policy.
 * Delets all policies in case upsert failed for any one policy and 'deleteInFailure' parameter is true.
 */
function validateUpsertResponse(policyResponses, azHttpClient, deleteInFailure = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const policies = getPoliciesFromResponse(policyResponses);
        try {
            validatePolicies(policies);
        }
        catch (error) {
            console.log(`Error occurred while creating policies.`);
            if (deleteInFailure) {
                // delete policies which were created.
                const validPolicies = policies.filter(policy => policy.id != undefined);
                const leftoutPolicyIds = yield deletePolicies(validPolicies, azHttpClient);
                if (leftoutPolicyIds.length > 0) {
                    // TODO PM: What happens when deletion fails.
                }
            }
            throw Error(error);
        }
    });
}
/**
 * Returns PolicyRequest array corresponding to the given policies.
 */
function getPolicyRequests(policies) {
    let policyRequests = [];
    policies.forEach(policy => {
        policyRequests.push({
            policy: policy
        });
    });
    return policyRequests;
}
/**
 * For given definition requests, get all assignment requests.
 */
function getAssignmentRequests(definitionRequests) {
    let assignmentRequests = [];
    const allDefinitionsPath = definitionRequests.map(request => request.path);
    const allAssignmentsPath = pathHelper_1.getAllAssignmentInPaths(allDefinitionsPath);
    allAssignmentsPath.forEach(assignmentPath => {
        assignmentRequests.push({
            path: assignmentPath,
            operation: policyHelper_1.POLICY_OPERATION_CREATE,
            policy: policyHelper_1.getPolicyAssignment(assignmentPath)
        });
    });
    return assignmentRequests;
}
/**
 * Remove assignment requests which were already created during force update.
 */
function removeAssignmentRequests(assignmentRequests, assignmentResponses) {
    const assignments = getPoliciesFromResponse(assignmentResponses);
    const assignmentIds = getPolicyIds(assignments);
    for (let index = assignmentRequests.length - 1; index >= 0; index--) {
        if (assignmentIds.includes(assignmentRequests[index].policy.id)) {
            assignmentRequests.splice(index, 1);
        }
    }
}
/**
 * For definitions which were force updated. Remove entry from original definition requests and responses to avoild false logging.
 */
function removePolicyDefinitionRequests(definitionRequests, policyResponses, badRequests) {
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
function getPolicyIds(policies) {
    return policies.map(policy => policy.id);
}
/**
 * Extracts policies from batch response array.
 */
function getPoliciesFromResponse(policyResponses) {
    return policyResponses.map(response => response.content);
}
/**
 * Populates result using requests and responses.
 */
function populateResults(definitionRequests, definitionResponses, assignmentRequests, assignmentResponses, policyResults) {
    let definitionResults = policyHelper_1.getPolicyResults(definitionRequests, definitionResponses, policyHelper_1.DEFINITION_TYPE);
    let assignmentResults = policyHelper_1.getPolicyResults(assignmentRequests, assignmentResponses, policyHelper_1.ASSIGNMENT_TYPE);
    definitionResults.forEach(result => {
        result.operation = exports.POLICY_OPERATION_FORCE_UPDATE;
    });
    assignmentResults.forEach(result => {
        result.operation = exports.POLICY_OPERATION_FORCE_CREATE;
    });
    policyResults.push(...definitionResults, ...assignmentResults);
}
/**
 * Checks whether policies are valid or not.
 */
function validatePolicies(policies) {
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
function verifyPolicyDeletion(policyIds, deletionResponses) {
    let leftoutPolicyIds = [];
    deletionResponses.forEach((response, index) => {
        if (response.httpStatusCode != httpClient_1.StatusCodes.OK) {
            leftoutPolicyIds.push(policyIds[index]);
        }
    });
    return leftoutPolicyIds;
}
