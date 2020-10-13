import { getAccessToken } from './azAuthentication';
import { StatusCodes, WebRequest, WebResponse, sendRequest, sleepFor } from "../utils/httpClient";
import { PolicyDetails, PolicyRequest } from './policyHelper'
import { splitArray, prettyDebugLog } from '../utils/utilities'

const SYNC_BATCH_CALL_SIZE = 20;
const ASYNC_BATCH_CALL_SIZE = 500;
const BATCH_POLL_TIMEOUT_DURATION: number = 5 * 60; // 5 mins
const BATCH_POLL_INTERVAL: number = 30; // 30 secs = 30

interface BatchRequest {
  name: string,
  httpMethod: string,
  url: string,
  content: any
}

interface BatchResponse {
  name: string,
  httpStatusCode: number,
  headers: any,
  content: any,
  contentLength: number
}

export class AzHttpClient {
  constructor() {
    this.batchCallUrl = `${this.batchManagementUrl}?api-version=${this.batchApiVersion}`;
  }

  async initialize() {
    this.token = await getAccessToken();
  }

  /**
   * For all policies, fetches policy from azure service and populates in the policy details.
   * 
   * @param allPolicyDetails : All Policy Details
   */
  async populateServicePolicies(allPolicyDetails: PolicyDetails[]) {
    const policies = allPolicyDetails.map(policyDetails => policyDetails.policyInCode);
    const batchResponses = await this.getBatchResponse(policies, 'GET');

    if (allPolicyDetails.length != batchResponses.length) {
      throw Error(`Azure batch response count does not match batch request count`);
    }

    allPolicyDetails.forEach((policyDetails, index) => {
      policyDetails.policyInService = batchResponses[index].content;
    });
  }

  async upsertPolicyDefinitions(policyRequests: PolicyRequest[]): Promise<any[]> {
    return this.upsertPolicies(policyRequests);
  }

  async upsertPolicyInitiatives(policyRequests: PolicyRequest[]): Promise<any[]> {
    return this.upsertPolicies(policyRequests);
  }

  async upsertPolicyAssignments(policyRequests: PolicyRequest[]): Promise<any[]> {
    return this.upsertPolicies(policyRequests);
  }

  /**
   * For given policy requests, create/update policy. Response of request is in order of request
   * So response at index i will be for policy request at index i.
   * 
   * @param policyRequests : policy requests.
   */
  private async upsertPolicies(policyRequests: PolicyRequest[]): Promise<any[]> {
    const policies = policyRequests.map(policyRequest => policyRequest.policy);
    const batchResponses = await this.getBatchResponse(policies, 'PUT');

    if (policyRequests.length != batchResponses.length) {
      throw Error(`Azure batch response count does not match batch request count`);
    }

    return batchResponses.map(response => response.content);
  }

  /**
   * For given policies, perfom the given method operation and return response in the order of request.
   * So response at index i will be for policy at index i.
   * 
   * @param policies : All policies
   * @param method : method to be used for batch call
   */
  private async getBatchResponse(policies: any[], method: string): Promise<any[]> {
    let batchRequests: BatchRequest[] = [];

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
    let batchResponses = await this.processBatchRequestAsync(batchRequests, batchCallSize);

    // We need to return response in the order of request.
    batchResponses.sort(this.compareBatchResponse);
    return batchResponses;
  }

  private async processBatchRequestAsync(batchRequests: BatchRequest[], batchCallSize: number): Promise<BatchResponse[]> {
    let batchResponses: BatchResponse[] = [];
    let pendingRequests: any[] = [];

    if (batchRequests.length == 0) {
      return Promise.resolve([]);
    }

    const batchRequestsChunks: BatchRequest[][] = splitArray(batchRequests, batchCallSize);

    for (const batchRequests of batchRequestsChunks) {
      const payload: any = { requests: batchRequests };

      try {
        let response = await this.sendRequest(this.batchCallUrl, 'POST', payload);

        if (response.statusCode == StatusCodes.OK) {
          batchResponses.push(...response.body.responses);
        }
        else if (response.statusCode == StatusCodes.ACCEPTED) {
          pendingRequests.push(response);
        }
        else {
          return Promise.reject(
            `An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`
          );
        }
      }
      catch (error) {
        prettyDebugLog(`An error occured while processing batch request. Error ${error}`);
        return Promise.reject(error);
      }
    }

    if (pendingRequests.length > 0) {
      try {
        prettyDebugLog(`${pendingRequests.length} batch requests needs to be polled.`);
        let pendingResponses: BatchResponse[] = await this.pollPendingRequests(pendingRequests);
        batchResponses.push(...pendingResponses);
      }
      catch (error) {
        return Promise.reject(`Error in polling. ${error}`);
      }
    }

    return batchResponses;
  }

  private async pollPendingRequests(pendingRequests: any[]): Promise<BatchResponse[]> {
    let batchResponses: BatchResponse[] = [];
    let hasPollTimedout: boolean = false;

    let pollTimeoutId = setTimeout(() => {
      hasPollTimedout = true;
    }, BATCH_POLL_TIMEOUT_DURATION);

    try {
      while (pendingRequests.length > 0 && !hasPollTimedout) {
        let currentPendingRequests: any[] = [];

        // delay before next poll
        await sleepFor(BATCH_POLL_INTERVAL);

        for (const pendingRequest of pendingRequests) {
          let response = await this.sendRequest(pendingRequest.headers.location, 'GET', undefined);

          if (response.statusCode == StatusCodes.OK) {
            batchResponses.push(...response.body.value);
          }
          else if (response.statusCode == StatusCodes.ACCEPTED) {
            currentPendingRequests.push(pendingRequest);
          }
          else {
            return Promise.reject(
              `An error occured while polling. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`
            );
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
      prettyDebugLog(`Polling responses timed-out.`);
      return Promise.reject(`Error in polling. Poll timed-out`);
    }

    return batchResponses;
  }

  private async sendRequest(url: string, method: string, payload: any): Promise<WebResponse> {

    let webRequest = new WebRequest();
    webRequest.method = method;
    webRequest.uri = url;
    webRequest.headers = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": `${process.env.AZURE_HTTP_USER_AGENT}`
    };

    if(payload) {
      webRequest.body = JSON.stringify(payload);
    }

    return sendRequest(webRequest);
  }

  private getResourceUrl(resourceId: string): string {
    return `${this.managementUrl}${resourceId}?api-version=${this.apiVersion}`;
  }

  private compareBatchResponse(response1: BatchResponse, response2: BatchResponse): number {
    return parseInt(response1.name) - parseInt(response2.name);
  }

  private getPolicyBatchCallName(index: number) {
    return `${index}`;
  }

  private token: string;
  private managementUrl: string = 'https://management.azure.com';
  private batchManagementUrl: string = 'https://management.azure.com/batch';
  private apiVersion: string = '2019-09-01';
  private batchApiVersion: string = '2019-09-01';
  private batchCallUrl: string;
}