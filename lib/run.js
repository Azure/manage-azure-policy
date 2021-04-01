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
const core = require("@actions/core");
const Inputs = require("./inputProcessing/inputs");
const policyHelper_1 = require("./azure/policyHelper");
const reportGenerator_1 = require("./report/reportGenerator");
const utilities_1 = require("./utils/utilities");
/**
 * Entry point for Action
 */
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let policyResults = null;
        try {
            Inputs.readInputs();
            utilities_1.setUpUserAgent();
            const policyRequests = yield policyHelper_1.getAllPolicyRequests();
            //2. Push above polices to Azure policy service
            policyResults = yield policyHelper_1.createUpdatePolicies(policyRequests);
            //3. Print summary result to console
            reportGenerator_1.printSummary(policyResults);
        }
        catch (error) {
            core.setFailed(error.message);
            utilities_1.prettyLog(`Error : ${error}`);
        }
        finally {
            //4. Set action outcome
            setResult(policyResults);
        }
    });
}
function setResult(policyResults) {
    if (!policyResults) {
        core.setFailed(`Error while deploying policies.`);
    }
    else {
        const failedCount = policyResults.filter(result => result.status === policyHelper_1.POLICY_RESULT_FAILED).length;
        if (failedCount > 0) {
            core.setFailed(`Found '${failedCount}' failure(s) while deploying policies.`);
        }
        else if (policyResults.length > 0) {
            core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
        }
        else {
            let warningMessage;
            if (Inputs.mode == Inputs.MODE_COMPLETE) {
                warningMessage = `Did not find any policies to create/update. No policy files match the given patterns. If you have policy definitions or policy initiatives, please ensure that the files are named '${policyHelper_1.POLICY_FILE_NAME}' and '${policyHelper_1.POLICY_INITIATIVE_FILE_NAME}' respectively. For more details, please enable debug logs by adding secret 'ACTIONS_STEP_DEBUG' with value 'true'. (https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-step-debug-logging)`;
            }
            else {
                warningMessage = `Did not find any policies to create/update. No policy files match the given patterns or no changes were detected. If you have policy definitions or policy initiatives, please ensure that the files are named '${policyHelper_1.POLICY_FILE_NAME}' and '${policyHelper_1.POLICY_INITIATIVE_FILE_NAME}' respectively. For more details, please enable debug logs by adding secret 'ACTIONS_STEP_DEBUG' with value 'true'. (https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-step-debug-logging)`;
            }
            core.warning(warningMessage);
        }
    }
}
run();
