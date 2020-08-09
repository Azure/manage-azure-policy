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
const core = __importStar(require("@actions/core"));
const azHttpClient_1 = require("./azure/azHttpClient");
const policyHelper_1 = require("./azure/policyHelper");
const reportGenerator_1 = require("./report/reportGenerator");
function setResult(policyResults) {
    const failedCount = policyResults.filter(result => result.status === policyHelper_1.POLICY_RESULT_FAILED).length;
    if (failedCount > 0) {
        core.setFailed(`Found '${failedCount}' failure(s) while deploying policies.`);
    }
    else {
        core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
    }
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const pathsInput = core.getInput("paths");
            if (!pathsInput) {
                core.setFailed("No path supplied.");
                return;
            }
            const paths = pathsInput.split('\n');
            let policyRequests1 = yield policyHelper_1.getAllPolicyRequests(paths);
            // For test purpose
            policyRequests1.forEach((policyReq) => {
                utilities_1.printPartitionedText(`Path : ${policyReq.path}\nOperation : ${policyReq.operation}\nPolicy : ${JSON.stringify(policyReq.policy, null, 4)}`);
            });
            // Get this array after parsing the paths and ignore-paths inputs.
            // Populating using env vars for testing. 
            const policyRequests = [
                {
                    path: process.env.DEFINITION_PATH || '',
                    type: policyHelper_1.DEFINITION_TYPE,
                    operation: policyHelper_1.POLICY_OPERATION_UPDATE
                },
                {
                    path: process.env.ASSIGNMENT_PATH || '',
                    type: policyHelper_1.ASSIGNMENT_TYPE,
                    operation: policyHelper_1.POLICY_OPERATION_UPDATE
                }
            ];
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            const policyResults = yield policyHelper_1.createUpdatePolicies(azHttpClient, policyRequests);
            reportGenerator_1.printSummary(policyResults);
            setResult(policyResults);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
