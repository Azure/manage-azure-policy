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
exports.AzHttpClient = void 0;
const core = require("@actions/core");
const azCli_1 = require("./azCli");
const httpClient_1 = require("../utils/httpClient");
const policyHelper_1 = require("./policyHelper");
const utilities_1 = require("../utils/utilities");
const roleAssignmentHelper_1 = require("./roleAssignmentHelper");
const SYNC_BATCH_CALL_SIZE = 20;
const DEFINITION_SCOPE_SEPARATOR = "/providers/Microsoft.Authorization/policyDefinitions";
class AzHttpClient {
    constructor() {
        this.apiVersion = '2019-09-01';
        this.batchApiVersion = '2019-09-01';
        this.roleApiVersion = '2019-04-01-preview';
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.token = yield azCli_1.AzCli.getAccessToken();
            this.managementUrl = yield azCli_1.AzCli.getManagementUrl();
            this.batchCallUrl = `${this.managementUrl}/batch?api-version=${this.batchApiVersion}`;
        });
    }
    /**
     * Gets all assignments of the provided policydefinition ids.
     *
     * @param policyDefinitionIds : PolicyDefinition Ids
     */
    getAllAssignments(policyDefinitionIds) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchRequests = [];
            policyDefinitionIds.forEach((policyDefinitionId, index) => {
                const policyBatchCallName = this.getPolicyBatchCallName(index);
                batchRequests.push({
                    url: this.getAllAssignmentsUrl(policyDefinitionId),
                    name: policyBatchCallName,
                    httpMethod: 'GET',
                    content: undefined
                });
            });
            let batchResponses = yield this.processBatchRequestSync(batchRequests);
            // We need to return response in the order of request.
            batchResponses.sort(this.compareBatchResponse);
            return batchResponses;
        });
    }
    /**
     * For all policies, fetches policy from azure service and populates in the policy details.
     *
     * @param allPolicyDetails : All Policy Details
     */
    populateServicePolicies(allPolicyDetails) {
        return __awaiter(this, void 0, void 0, function* () {
            const policies = allPolicyDetails.map(policyDetails => policyDetails.policyInCode);
            const batchResponses = yield this.getBatchResponse(policies, 'GET');
            if (allPolicyDetails.length != batchResponses.length) {
                throw Error(`Azure batch response count does not match batch request count`);
            }
            allPolicyDetails.forEach((policyDetails, index) => {
                policyDetails.policyInService = batchResponses[index].content;
            });
        });
    }
    getPolicyDefintions(policyIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const policies = policyHelper_1.createPoliciesUsingIds(policyIds);
            const batchResponses = yield this.getBatchResponse(policies, 'GET');
            if (policyIds.length != batchResponses.length) {
                throw Error(`Azure batch response count does not match batch request count`);
            }
            return batchResponses.map(response => response.content);
        });
    }
    addRoleAssinments(roleRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchRequests = [];
            roleRequests.forEach((roleRequest, index) => {
                const policyBatchCallName = this.getPolicyBatchCallName(index);
                batchRequests.push({
                    url: this.getRoleAssignmentUrl(roleRequest.scope, roleRequest.roleAssignmentId),
                    name: policyBatchCallName,
                    httpMethod: 'PUT',
                    content: this.getRoleAssignmentBody(roleRequest)
                });
            });
            let batchResponses = yield this.processBatchRequestSync(batchRequests);
            // We need to return response in the order of request.
            batchResponses.sort(this.compareBatchResponse);
            return batchResponses;
        });
    }
    upsertPolicyDefinitions(policyRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.upsertPolicies(policyRequests);
        });
    }
    upsertPolicyInitiatives(policyRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.upsertPolicies(policyRequests);
        });
    }
    upsertPolicyAssignments(policyRequests, roleAssignmentResults) {
        return __awaiter(this, void 0, void 0, function* () {
            const assignmentResponses = yield this.upsertPolicies(policyRequests);
            // Now we need to add roles to managed identity for policy remediation.
            yield roleAssignmentHelper_1.assignRoles(policyRequests, assignmentResponses, roleAssignmentResults);
            return assignmentResponses;
        });
    }
    deletePolicies(policyIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const policies = policyHelper_1.createPoliciesUsingIds(policyIds);
            const batchResponses = yield this.getBatchResponse(policies, 'DELETE');
            if (policyIds.length != batchResponses.length) {
                throw Error(`Azure batch response count does not match batch request count`);
            }
            return batchResponses;
        });
    }
    /**
     * For given policy requests, create/update policy. Response of request is in order of request
     * So response at index i will be for policy request at index i.
     *
     * @param policyRequests : policy requests.
     */
    upsertPolicies(policyRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            const policies = policyRequests.map(policyRequest => policyRequest.policy);
            const batchResponses = yield this.getBatchResponse(policies, 'PUT');
            if (policyRequests.length != batchResponses.length) {
                throw Error(`Azure batch response count does not match batch request count`);
            }
            return batchResponses;
        });
    }
    /**
     * For given policies, perfom the given method operation and return response in the order of request.
     * So response at index i will be for policy at index i.
     *
     * @param policies : All policies
     * @param method : method to be used for batch call
     */
    getBatchResponse(policies, method) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchRequests = [];
            policies.forEach((policy, index) => {
                const policyBatchCallName = this.getPolicyBatchCallName(index);
                batchRequests.push({
                    url: this.getResourceUrl(policy.id),
                    name: policyBatchCallName,
                    httpMethod: method,
                    content: method == 'PUT' ? policy : undefined
                });
            });
            let batchResponses = yield this.processBatchRequestSync(batchRequests);
            // We need to return response in the order of request.
            batchResponses.sort(this.compareBatchResponse);
            return batchResponses;
        });
    }
    processBatchRequestSync(batchRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchResponses = [];
            if (batchRequests.length == 0) {
                return Promise.resolve([]);
            }
            // For sync implementation we will divide into chunks of 20 requests.
            const batchRequestsChunks = utilities_1.splitArray(batchRequests, SYNC_BATCH_CALL_SIZE);
            for (const batchRequests of batchRequestsChunks) {
                const payload = { requests: batchRequests };
                try {
                    let response = yield this.sendRequest(this.batchCallUrl, 'POST', payload);
                    if (response.statusCode == httpClient_1.StatusCodes.OK) {
                        batchResponses.push(...response.body.responses);
                    }
                    else {
                        return Promise.reject(`An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
                    }
                }
                catch (error) {
                    return Promise.reject(error);
                }
            }
            utilities_1.prettyDebugLog(`Status of batch calls:`);
            batchResponses.forEach(response => {
                core.debug(`Name : ${response.name}. Status : ${response.httpStatusCode}`);
            });
            utilities_1.prettyDebugLog(`End`);
            return batchResponses;
        });
    }
    sendRequest(url, method, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let webRequest = new httpClient_1.WebRequest();
            webRequest.method = method;
            webRequest.uri = url;
            webRequest.headers = {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": `${process.env.AZURE_HTTP_USER_AGENT}`
            };
            if (payload) {
                webRequest.body = JSON.stringify(payload);
            }
            return httpClient_1.sendRequest(webRequest);
        });
    }
    getResourceUrl(resourceId) {
        return `${this.managementUrl}${resourceId}?api-version=${this.apiVersion}`;
    }
    getRoleAssignmentUrl(scope, roleAssignmentId) {
        return `${this.managementUrl}${scope}/providers/Microsoft.Authorization/roleAssignments/${roleAssignmentId}?api-version=${this.roleApiVersion}`;
    }
    getRoleAssignmentBody(roleRequest) {
        return {
            properties: {
                roleDefinitionId: `${roleRequest.scope}/providers/Microsoft.Authorization/roleDefinitions/${roleRequest.roleDefinitionId}`,
                principalType: "ServicePrincipal",
                principalId: roleRequest.principalId
            }
        };
    }
    getAllAssignmentsUrl(policyDefinitionId) {
        const definitionScope = policyDefinitionId.split(DEFINITION_SCOPE_SEPARATOR)[0];
        return `${this.managementUrl}${definitionScope}/providers/Microsoft.Authorization/policyAssignments?api-version=${this.apiVersion}&$filter=policyDefinitionId eq '${policyDefinitionId}'`;
    }
    compareBatchResponse(response1, response2) {
        return parseInt(response1.name) - parseInt(response2.name);
    }
    getPolicyBatchCallName(index) {
        return `${index}`;
    }
}
exports.AzHttpClient = AzHttpClient;
