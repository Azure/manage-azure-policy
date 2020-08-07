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
exports.createOrUpdatePolicyObjects = exports.getAllPolicyRequests = exports.setResult = exports.POLICY_OPERATION_UPDATE = exports.POLICY_OPERATION_CREATE = exports.ASSIGNMENT_TYPE = exports.DEFINITION_TYPE = void 0;
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const azHttpClient_1 = require("./azHttpClient");
const fileHelper_1 = require("../utils/fileHelper");
const hashUtils_1 = require("../utils/hashUtils");
exports.DEFINITION_TYPE = "Microsoft.Authorization/policyDefinitions";
exports.ASSIGNMENT_TYPE = "Microsoft.Authorization/policyAssignments";
exports.POLICY_OPERATION_CREATE = "CREATE";
exports.POLICY_OPERATION_UPDATE = "UPDATE";
const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
function setResult(policyResults) {
    const failedCount = policyResults.filter(result => result.status === POLICY_RESULT_FAILED).length;
    if (failedCount > 0) {
        core.setFailed(`Found '${failedCount}' failure(s) while deploying policies.`);
    }
    else {
        core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
    }
}
exports.setResult = setResult;
function getAllPolicyRequests(paths) {
    return __awaiter(this, void 0, void 0, function* () {
        let policyRequests = [];
        try {
            let allJsonFiles = fileHelper_1.getAllJsonFilesPath(paths);
            console.log("all json files : " + allJsonFiles);
            let policies = getAllPolicies(allJsonFiles);
            console.log(policies);
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            for (let policy of policies) {
                let githubHash = hashUtils_1.getObjectHash(policy);
                let azureMetadata;
                // TODO : Only update case handled. Need to handle create case
                if (policy.type == exports.DEFINITION_TYPE) {
                    let azDefinition = yield azHttpClient.getPolicyDefinition(policy);
                    azureMetadata = azDefinition.properties.metadata;
                }
                else {
                    let azAssignment = yield azHttpClient.getPolicyAssignment(policy);
                    azureMetadata = azAssignment.properties.metadata;
                }
                console.log("azure metaData : " + JSON.stringify(azureMetadata));
                let updateRequired = false;
                if (azureMetadata.GitHubPolicy) {
                    let azureHash = azureMetadata.GitHubPolicy.policy_hash;
                    if (azureHash == githubHash) {
                        console.log("Hash is same no need to update");
                    }
                    else {
                        console.log("Hash is not same. We need to update.");
                        updateRequired = true;
                    }
                }
                else {
                    console.log("Github metaData is not present. Will need to update");
                    updateRequired = true;
                }
                if (updateRequired) {
                    policyRequests.push(getPolicyRequest(policy, githubHash, exports.POLICY_OPERATION_UPDATE));
                }
            }
        }
        catch (error) {
            return Promise.reject(error);
        }
        return Promise.resolve(policyRequests);
    });
}
exports.getAllPolicyRequests = getAllPolicyRequests;
function createOrUpdatePolicyObjects(azHttpClient, policyRequests) {
    return __awaiter(this, void 0, void 0, function* () {
        let policyResults = [];
        for (const policyRequest of policyRequests) {
            let policyResult = {
                path: policyRequest.path,
                type: policyRequest.type,
                operation: policyRequest.operation,
                name: '',
                status: '',
                message: ''
            };
            const isCreate = policyRequest.operation == exports.POLICY_OPERATION_CREATE;
            switch (policyRequest.type) {
                case exports.DEFINITION_TYPE:
                    try {
                        const definition = getPolicyDefinition(policyRequest.path);
                        validateDefinition(definition);
                        policyResult.name = definition.name;
                        yield azHttpClient.createOrUpdatePolicyDefinition(definition);
                        policyResult.status = POLICY_RESULT_SUCCEEDED;
                        policyResult.message = `Policy definition ${isCreate ? 'created' : 'updated'} successfully`;
                        console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
                    }
                    catch (error) {
                        policyResult.status = POLICY_RESULT_FAILED;
                        policyResult.message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy defition. Error: ${error}`;
                        console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
                    }
                    policyResults.push(policyResult);
                    break;
                case exports.ASSIGNMENT_TYPE:
                    try {
                        const assignment = getPolicyAssignment(policyRequest.path);
                        validateAssignment(assignment);
                        policyResult.name = assignment.name;
                        yield azHttpClient.createOrUpdatePolicyAssignment(assignment);
                        policyResult.status = POLICY_RESULT_SUCCEEDED;
                        policyResult.message = `Policy assignment ${isCreate ? 'created' : 'updated'} successfully`;
                        console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
                    }
                    catch (error) {
                        policyResult.status = POLICY_RESULT_FAILED;
                        policyResult.message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy assignment. Error: ${error}`;
                        console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
                    }
                    policyResults.push(policyResult);
                    break;
            }
        }
        return Promise.resolve(policyResults);
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
// Returns all policy definition, assgnments present in the given paths.
function getAllPolicies(jsonPaths) {
    let policies = [];
    jsonPaths.forEach((path) => {
        let policy = getPolicyObject(path);
        if (policy) {
            policies.push(policy);
        }
    });
    return policies;
}
function getPolicyObject(path) {
    let jsonObj = fileHelper_1.getFileJson(path);
    // Todo : For DEFINITION_TYPE we need to check for parameter and rules files if required.
    if (jsonObj.type && jsonObj.type == exports.ASSIGNMENT_TYPE || jsonObj.type == exports.DEFINITION_TYPE) {
        return jsonObj;
    }
    return undefined;
}
function getWorkflowMetadata(policyHash) {
    let metadata = {
        policy_hash: policyHash
    };
    return metadata;
}
function getPolicyRequest(policy, hash, operation) {
    let metadata = getWorkflowMetadata(hash);
    if (!policy.properties.metadata) {
        policy.properties.metadata = {};
    }
    policy.properties.metadata.GitHubPolicy = metadata;
    return {
        policy: policy,
        operation: operation
    };
}
