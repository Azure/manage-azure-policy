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
const azAuthentication_1 = require("./azAuthentication");
const httpClient_1 = require("../utils/httpClient");
const utilities_1 = require("../utils/utilities");
const SYNC_BATCH_CALL_SIZE = 20;
class AzHttpClient {
    constructor() {
        this.managementUrl = 'https://management.azure.com';
        this.batchManagementUrl = 'https://management.azure.com/batch';
        this.apiVersion = '2019-09-01';
        this.batchApiVersion = '2019-09-01';
        this.roleApiVersion = '2015-07-01';
        this.batchCallUrl = `${this.batchManagementUrl}?api-version=${this.batchApiVersion}`;
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.token = yield azAuthentication_1.getAccessToken();
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
            let policies = [];
            policyIds.forEach(policyId => {
                policies.push({
                    id: policyId
                });
            });
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
    upsertPolicyAssignments(policyRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.upsertPolicies(policyRequests);
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
            return batchResponses.map(response => response.content);
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
        return `https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments/${roleAssignmentId}?api-version=${this.roleApiVersion}`;
    }
    getRoleAssignmentBody(roleRequest) {
        return {
            properties: {
                roleDefinitionId: `/${roleRequest.scope}/providers/Microsoft.Authorization/roleDefinitions/${roleRequest.roleDefinitionId}`,
                principalId: roleRequest.principalId
            }
        };
    }
    compareBatchResponse(response1, response2) {
        return parseInt(response1.name) - parseInt(response2.name);
    }
    getPolicyBatchCallName(index) {
        return `${index}`;
    }
}
exports.AzHttpClient = AzHttpClient;
