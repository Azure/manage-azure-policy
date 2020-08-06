import { getAccessToken } from './azAuthentication';
import { StatusCodes, WebRequest, WebResponse, sendRequest } from "../utils/httpClient";

export class AzHttpClient {
  async initialize() {
    this.token = await getAccessToken();
  }

  async createOrUpdatePolicyDefinition(definition: any): Promise<any> {
    return this.sendRequest('PUT', definition.id, definition)
      .then((response) => {
        console.log(`Create/Update definition response, statuscode: ${response.statusCode}, body: ${JSON.stringify(response.body)}`);
      if(response.statusCode == StatusCodes.CREATED) {
        return Promise.resolve(response);
      } else {
        return Promise.reject(`Error response from server. StatusCode: ${response.statusCode}. Response: ${JSON.stringify(response.body)}`);
      }
    })
    .catch((error) => {
      return Promise.reject(error);
    });
  }

  async createOrUpdatePolicyAssignment(assignment: any): Promise<any> {
    return this.sendRequest('PUT', assignment.id, assignment)
      .then((response) => {
        console.log(`Create/Update assignment response, statuscode: ${response.statusCode}, body: ${JSON.stringify(response.body)}`);
      if(response.statusCode == StatusCodes.CREATED) {
        return Promise.resolve(response);
      } else {
        return Promise.reject(`Error response from server. StatusCode: ${response.statusCode}. Response: ${JSON.stringify(response.body)}`);
      }
    })
    .catch((error) => {
      return Promise.reject(error);
    });
  }

  private async sendRequest(method: string, resourceId: string, payload: any): Promise<WebResponse> {
    const url = `${this.managementUrl}${resourceId}?api-version=${this.apiVersion}`;

    let webRequest = new WebRequest();
    webRequest.method = method;
    webRequest.uri = url;
    webRequest.headers = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    if(payload) {
      webRequest.body = JSON.stringify(payload);
    }

    console.log('webrequest.body', webRequest.body);
    return sendRequest(webRequest);
  }

  private token: string;
  private managementUrl: string = 'https://management.azure.com';
  private apiVersion: string = '2019-09-01';
}