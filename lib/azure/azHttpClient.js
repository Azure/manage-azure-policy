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
const ASYNC_BATCH_CALL_SIZE = 500;
const BATCH_POLL_TIMEOUT_DURATION = 5 * 60; // 5 mins
const BATCH_POLL_INTERVAL = 30; // 30 secs = 30
class AzHttpClient {
    constructor() {
        this.managementUrl = 'https://management.azure.com';
        this.batchManagementUrl = 'https://management.azure.com/batch';
        this.apiVersion = '2019-09-01';
        this.batchApiVersion = '2019-09-01';
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
            let batchCallSize = (method == 'PUT') ? SYNC_BATCH_CALL_SIZE : ASYNC_BATCH_CALL_SIZE;
            let batchResponses = yield this.processBatchRequestAsync(batchRequests, batchCallSize);
            // We need to return response in the order of request.
            batchResponses.sort(this.compareBatchResponse);
            return batchResponses;
        });
    }
    processBatchRequestAsync(batchRequests, batchCallSize) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchResponses = [];
            let pendingRequests = [];
            if (batchRequests.length == 0) {
                return Promise.resolve([]);
            }
            const batchRequestsChunks = utilities_1.splitArray(batchRequests, batchCallSize);
            for (const batchRequests of batchRequestsChunks) {
                const payload = { requests: batchRequests };
                try {
                    let response = yield this.sendRequest(this.batchCallUrl, 'POST', payload);
                    if (response.statusCode == httpClient_1.StatusCodes.OK) {
                        batchResponses.push(...response.body.responses);
                    }
                    else if (response.statusCode == httpClient_1.StatusCodes.ACCEPTED) {
                        pendingRequests.push(response);
                    }
                    else {
                        return Promise.reject(`An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
                    }
                }
                catch (error) {
                    utilities_1.prettyDebugLog(`An error occured while processing batch request. Error ${error}`);
                    return Promise.reject(error);
                }
            }
            if (pendingRequests.length > 0) {
                try {
                    utilities_1.prettyDebugLog(`${pendingRequests.length} batch requests needs to be polled.`);
                    let pendingResponses = yield this.pollPendingRequests(pendingRequests);
                    batchResponses.push(...pendingResponses);
                }
                catch (error) {
                    return Promise.reject(`Error in polling. ${error}`);
                }
            }
            return batchResponses;
        });
    }
    pollPendingRequests(pendingRequests) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchResponses = [];
            let hasPollTimedout = false;
            let pollTimeoutId = setTimeout(() => {
                hasPollTimedout = true;
            }, BATCH_POLL_TIMEOUT_DURATION);
            try {
                while (pendingRequests.length > 0 && !hasPollTimedout) {
                    let currentPendingRequests = [];
                    // delay before next poll
                    yield httpClient_1.sleepFor(BATCH_POLL_INTERVAL);
                    for (const pendingRequest of pendingRequests) {
                        let response = yield this.sendRequest(pendingRequest.headers.location, 'GET', undefined);
                        if (response.statusCode == httpClient_1.StatusCodes.OK) {
                            batchResponses.push(...response.body.value);
                        }
                        else if (response.statusCode == httpClient_1.StatusCodes.ACCEPTED) {
                            currentPendingRequests.push(pendingRequest);
                        }
                        else {
                            return Promise.reject(`An error occured while polling. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
                        }
                    }
                    pendingRequests = currentPendingRequests;
                }
            }
            catch (error) {
                return Promise.reject(`Error in polling. ${error}`);
            }
            finally {
                if (!hasPollTimedout) {
                    clearTimeout(pollTimeoutId);
                }
            }
            if (hasPollTimedout && pendingRequests.length > 0) {
                utilities_1.prettyDebugLog(`Polling responses timed-out.`);
                return Promise.reject(`Error in polling. Poll timed-out`);
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
    compareBatchResponse(response1, response2) {
        return parseInt(response1.name) - parseInt(response2.name);
    }
    getPolicyBatchCallName(index) {
        return `${index}`;
    }
}
exports.AzHttpClient = AzHttpClient;
