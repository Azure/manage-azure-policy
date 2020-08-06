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
exports.createOrUpdatePolicyObjects = exports.ASSIGNMENT_TYPE = exports.DEFINITION_TYPE = void 0;
const path = __importStar(require("path"));
const fileHelper_1 = require("../utils/fileHelper");
exports.DEFINITION_TYPE = "definition";
exports.ASSIGNMENT_TYPE = "assignment";
const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
function createOrUpdatePolicyObjects(azHttpClient, policyRequests) {
    return __awaiter(this, void 0, void 0, function* () {
        let policyResults = [];
        for (const policyRequest of policyRequests) {
            let policyResult = { path: policyRequest.path, type: policyRequest.type, status: '' };
            switch (policyRequest.type) {
                case exports.DEFINITION_TYPE:
                    try {
                        const definition = getPolicyDefinition(policyRequest.path);
                        validateDefinition(definition);
                        yield azHttpClient.createOrUpdatePolicyDefinition(definition);
                        policyResult.status = POLICY_RESULT_SUCCEEDED;
                        console.log(`Policy definition created/updated successfully. Path: ${policyRequest.path}`);
                    }
                    catch (error) {
                        policyResult.status = POLICY_RESULT_FAILED;
                        policyResult.message = `An error occured while creating/updating policy defition. Path: ${policyRequest.path} . Error: ${error}`;
                        console.log(`An error occured while creating/updating policy defition. Path: ${policyRequest.path} . Error: ${error}`);
                    }
                    policyResults.push(policyResult);
                    break;
                case exports.ASSIGNMENT_TYPE:
                    try {
                        const assignment = getPolicyAssignment(policyRequest.path);
                        validateAssignment(assignment);
                        yield azHttpClient.createOrUpdatePolicyAssignment(assignment);
                        policyResult.status = POLICY_RESULT_SUCCEEDED;
                        console.log(`Policy assignment created/updated successfully. Path: ${policyRequest.path}`);
                    }
                    catch (error) {
                        policyResult.status = POLICY_RESULT_FAILED;
                        policyResult.message = `An error occured while creating/updating policy assignment. Path: ${policyRequest.path} . Error: ${error}`;
                        console.log(`An error occured while creating/updating policy assignment. Path: ${policyRequest.path} . Error: ${error}`);
                    }
                    policyResults.push(policyResult);
                    break;
            }
        }
    });
}
exports.createOrUpdatePolicyObjects = createOrUpdatePolicyObjects;
function getPolicyDefinition(definitionPath) {
    const policyPath = path.join(definitionPath, POLICY_FILE_NAME);
    const policyRulesPath = path.join(definitionPath, POLICY_RULES_FILE_NAME);
    const policyParametersPath = path.join(definitionPath, POLICY_PARAMETERS_FILE_NAME);
    let definition = fileHelper_1.getFileJson(policyPath);
    if ((!definition.properties || !definition.properties.policyRule) && fileHelper_1.doesFileExist(policyRulesPath)) {
        const policyRuleJson = fileHelper_1.getFileJson(policyRulesPath);
        if (policyRuleJson && policyRuleJson.policyRule) {
            if (!definition.properties) {
                // If properties is missing from the definition object and we obtain policyRule from the
                // policy rules file, add properties.
                definition.properties = {};
            }
            definition.properties.policyRule = policyRuleJson.policyRule;
        }
    }
    if ((!definition.properties || !definition.properties.parameters) && fileHelper_1.doesFileExist(policyParametersPath)) {
        const policyParametersJson = fileHelper_1.getFileJson(policyParametersPath);
        if (policyParametersJson && policyParametersJson.parameters) {
            if (!definition.properties) {
                // If properties is missing from the definition object and we obtain parameters from the
                // policy parameters file, add properties.
                definition.properties = {};
            }
            definition.properties.parameters = policyParametersJson.parameters;
        }
    }
    return definition;
}
function getPolicyAssignment(assignmentPath) {
    return fileHelper_1.getFileJson(assignmentPath);
}
function validateDefinition(definition) {
    if (!definition.id) {
        throw Error('Property id is missing from the policy definition. Please add id to the policy.json file.');
    }
    if (!definition.name) {
        throw Error('Property name is missing from the policy definition. Please add name to the policy.json file.');
    }
}
function validateAssignment(assignment) {
    if (!assignment.id) {
        throw Error('Property id is missing from the policy assignment. Please add id to the assignment file.');
    }
    if (!assignment.name) {
        throw Error('Property name is missing from the policy assignment. Please add name to the assignment file.');
    }
}
