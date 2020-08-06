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
class AzHttpClient {
    constructor() {
        this.managementUrl = 'https://management.azure.com';
        this.apiVersion = '2019-09-01';
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.token = yield azAuthentication_1.getAccessToken();
        });
    }
    createOrUpdatePolicyDefinition(definition) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sendRequest('PUT', definition.id, definition)
                .then((response) => {
                // console.log(`Create/Update definition response, statuscode: ${response.statusCode}, body: ${JSON.stringify(response.body)}`);
                if (response.statusCode == httpClient_1.StatusCodes.CREATED) {
                    return Promise.resolve(response);
                }
                else {
                    return Promise.reject(`Error response from server. StatusCode: ${response.statusCode}. Response: ${JSON.stringify(response.body)}`);
                }
            })
                .catch((error) => {
                return Promise.reject(error);
            });
        });
    }
    createOrUpdatePolicyAssignment(assignment) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sendRequest('PUT', assignment.id, assignment)
                .then((response) => {
                // console.log(`Create/Update assignment response, statuscode: ${response.statusCode}, body: ${JSON.stringify(response.body)}`);
                if (response.statusCode == httpClient_1.StatusCodes.CREATED) {
                    return Promise.resolve(response);
                }
                else {
                    return Promise.reject(`Error response from server. StatusCode: ${response.statusCode}. Response: ${JSON.stringify(response.body)}`);
                }
            })
                .catch((error) => {
                return Promise.reject(error);
            });
        });
    }
    sendRequest(method, resourceId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `${this.managementUrl}${resourceId}?api-version=${this.apiVersion}`;
            let webRequest = new httpClient_1.WebRequest();
            webRequest.method = method;
            webRequest.uri = url;
            webRequest.headers = {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "application/json; charset=utf-8",
            };
            if (payload) {
                webRequest.body = JSON.stringify(payload);
            }
            // console.log('webrequest.body', webRequest.body);
            return httpClient_1.sendRequest(webRequest);
        });
    }
}
exports.AzHttpClient = AzHttpClient;
