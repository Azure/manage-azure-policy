import * as core from '@actions/core';
import { AzCli } from "./azCli";
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "../utils/httpClient";
import { PolicyDetails, PolicyRequest, PolicyResult, createPoliciesUsingIds } from './policyHelper'
import { prettyDebugLog, splitArray } from '../utils/utilities'
import { RoleRequest, assignRoles } from './roleAssignmentHelper'

const SYNC_BATCH_CALL_SIZE = 20;
const DEFINITION_SCOPE_SEPARATOR = "/providers/Microsoft.Authorization/policyDefinitions";

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

  async initialize() {
    this.token = await AzCli.getAccessToken();
    this.managementUrl = await AzCli.getManagementUrl();
    this.batchCallUrl = `${this.managementUrl}/batch?api-version=${this.batchApiVersion}`;
  }

  /**
   * Gets all assignments of the provided policydefinition ids.
   * 
   * @param policyDefinitionIds : PolicyDefinition Ids
   */
  async getAllAssignments(policyDefinitionIds: string[]): Promise<BatchResponse[]> {
    let batchRequests: BatchRequest[] = [];

    policyDefinitionIds.forEach((policyDefinitionId, index) => {
      const policyBatchCallName = this.getPolicyBatchCallName(index);
      batchRequests.push({
        url: this.getAllAssignmentsUrl(policyDefinitionId),
        name: policyBatchCallName,
        httpMethod: 'GET',
        content: undefined
      });
    });

    let batchResponses = await this.processBatchRequestSync(batchRequests);

    // We need to return response in the order of request.
    batchResponses.sort(this.compareBatchResponse);
    return batchResponses;
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

  async getPolicyDefintions(policyIds: string[]):Promise<any[]> {
    const policies = createPoliciesUsingIds(policyIds);

    const batchResponses = await this.getBatchResponse(policies, 'GET');
    if (policyIds.length != batchResponses.length) {
      throw Error(`Azure batch response count does not match batch request count`);
    }

    return batchResponses.map(response => response.content);
  }

  async addRoleAssinments(roleRequests: RoleRequest[]):Promise<BatchResponse[]> {
    let batchRequests: BatchRequest[] = [];

    roleRequests.forEach((roleRequest, index) => {
      const policyBatchCallName = this.getPolicyBatchCallName(index);
      batchRequests.push({
        url: this.getRoleAssignmentUrl(roleRequest.scope, roleRequest.roleAssignmentId),
        name: policyBatchCallName,
        httpMethod: 'PUT',
        content: this.getRoleAssignmentBody(roleRequest)
      });
    });


    let batchResponses = await this.processBatchRequestSync(batchRequests);

    // We need to return response in the order of request.
    batchResponses.sort(this.compareBatchResponse);
    return batchResponses;
  }

  async upsertPolicyDefinitions(policyRequests: PolicyRequest[]): Promise<any[]> {
    return this.upsertPolicies(policyRequests);
  }

  async upsertPolicyInitiatives(policyRequests: PolicyRequest[]): Promise<any[]> {
    return this.upsertPolicies(policyRequests);
  }

  async upsertPolicyAssignments(policyRequests: PolicyRequest[], roleAssignmentResults: PolicyResult[]): Promise<any[]> {
    const assignmentResponses = await this.upsertPolicies(policyRequests);

    // Now we need to add roles to managed identity for policy remediation.
    await assignRoles(policyRequests, assignmentResponses, roleAssignmentResults);

    return assignmentResponses;
  }

  async deletePolicies(policyIds: string[]): Promise<any[]> {
    const policies = createPoliciesUsingIds(policyIds);

    const batchResponses = await this.getBatchResponse(policies, 'DELETE');
    if (policyIds.length != batchResponses.length) {
      throw Error(`Azure batch response count does not match batch request count`);
    }

    return batchResponses;
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

    return batchResponses;
  }

  /**
   * For given policies, perfom the given method operation and return response in the order of request.
   * So response at index i will be for policy at index i.
   * 
   * @param policies : All policies
   * @param method : method to be used for batch call
   */
  private async getBatchResponse(policies: any[], method: string): Promise<BatchResponse[]> {
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

    let batchResponses = await this.processBatchRequestSync(batchRequests);

    // We need to return response in the order of request.
    batchResponses.sort(this.compareBatchResponse);
    return batchResponses;
  }

  async processBatchRequestSync(batchRequests: BatchRequest[]): Promise<BatchResponse[]> {
    let batchResponses: BatchResponse[] = [];

    if (batchRequests.length == 0) {
      return Promise.resolve([]);
    }

    // For sync implementation we will divide into chunks of 20 requests.
    const batchRequestsChunks: BatchRequest[][] = splitArray(batchRequests, SYNC_BATCH_CALL_SIZE);

    for (const batchRequests of batchRequestsChunks) {
      const payload: any = { requests: batchRequests };

      try {
        let response = await this.sendRequest(this.batchCallUrl, 'POST', payload);

        if (response.statusCode == StatusCodes.OK) {
          batchResponses.push(...response.body.responses);
        }
        else {
          return Promise.reject(
            `An error occured while fetching the batch result. StatusCode: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`
          );
        }
      }
      catch (error) {
        return Promise.reject(error);
      }
    }

    prettyDebugLog(`Status of batch calls:`);
    batchResponses.forEach(response => {
      core.debug(`Name : ${response.name}. Status : ${response.httpStatusCode}`);
    });
    prettyDebugLog(`End`);

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

  private getRoleAssignmentUrl(scope: string, roleAssignmentId: string): string {
    return `${this.managementUrl}${scope}/providers/Microsoft.Authorization/roleAssignments/${roleAssignmentId}?api-version=${this.roleApiVersion}`
  }

  private getRoleAssignmentBody(roleRequest: RoleRequest): any {
    return {
      properties : {
        roleDefinitionId: `${roleRequest.scope}/providers/Microsoft.Authorization/roleDefinitions/${roleRequest.roleDefinitionId}`,
        principalType: "ServicePrincipal",
        principalId: roleRequest.principalId
      }
    }
  }

  private getAllAssignmentsUrl(policyDefinitionId: string): string {
    const definitionScope = policyDefinitionId.split(DEFINITION_SCOPE_SEPARATOR)[0];
    return `${this.managementUrl}${definitionScope}/providers/Microsoft.Authorization/policyAssignments?api-version=${this.apiVersion}&$filter=policyDefinitionId eq '${policyDefinitionId}'`;
  }

  private compareBatchResponse(response1: BatchResponse, response2: BatchResponse): number {
    return parseInt(response1.name) - parseInt(response2.name);
  }

  private getPolicyBatchCallName(index: number) {
    return `${index}`;
  }

  private token: string;
  private managementUrl: string;
  private apiVersion: string = '2020-09-01';
  private batchApiVersion: string = '2020-09-01';
  private roleApiVersion: string = '2019-04-01-preview';
  private batchCallUrl: string;
}