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
exports.AzCli = void 0;
const core = require("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");
class AzCli {
    static getManagementUrl() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._baseUrl) {
                try {
                    let azCloudDetails = JSON.parse(yield this.executeCommand('cloud show'));
                    const cloudEndpoints = azCloudDetails['endpoints'];
                    this._baseUrl = this.getResourceManagerUrl(cloudEndpoints);
                }
                catch (error) {
                    console.log('Failed to get management URL from azure. Setting it to default url for public cloud.');
                    this._baseUrl = this.defaultManagementUrl;
                }
            }
            return this._baseUrl;
        });
    }
    static getAccessToken() {
        return __awaiter(this, void 0, void 0, function* () {
            const resource = yield this.getManagementUrl();
            let accessToken = "";
            try {
                let azAccessToken = JSON.parse(yield this.executeCommand("account get-access-token --resource=" + resource));
                core.setSecret(azAccessToken);
                accessToken = azAccessToken['accessToken'];
            }
            catch (error) {
                console.log('Failed to fetch Azure access token');
                throw error;
            }
            return accessToken;
        });
    }
    static executeCommand(command, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let azCliPath = yield io.which('az', true);
            let stdout = '';
            let stderr = '';
            try {
                core.debug(`"${azCliPath}" ${command}`);
                yield exec.exec(`"${azCliPath}" ${command}`, args, {
                    silent: true,
                    listeners: {
                        stdout: (data) => {
                            stdout += data.toString();
                        },
                        stderr: (data) => {
                            stderr += data.toString();
                        }
                    }
                });
            }
            catch (error) {
                throw new Error(stderr);
            }
            return stdout;
        });
    }
    static getResourceManagerUrl(cloudEndpoints) {
        if (!cloudEndpoints['resourceManager']) {
            return this.defaultManagementUrl;
        }
        // Remove trailing slash.
        return cloudEndpoints['resourceManager'].replace(/\/$/, "");
    }
}
exports.AzCli = AzCli;
AzCli.defaultManagementUrl = "https://management.azure.com";
