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
exports.createUpdatePolicies = exports.getAllPolicyRequests = exports.POLICY_FILE_NAME = exports.POLICY_RESULT_SUCCEEDED = exports.POLICY_RESULT_FAILED = exports.POLICY_OPERATION_NONE = exports.POLICY_OPERATION_UPDATE = exports.POLICY_OPERATION_CREATE = exports.ASSIGNMENT_TYPE = exports.DEFINITION_TYPE = void 0;
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const azHttpClient_1 = require("./azHttpClient");
const fileHelper_1 = require("../utils/fileHelper");
const hashUtils_1 = require("../utils/hashUtils");
const utilities_1 = require("../utils/utilities");
const pathHelper_1 = require("../inputProcessing/pathHelper");
const Inputs = __importStar(require("../inputProcessing/inputs"));
exports.DEFINITION_TYPE = "Microsoft.Authorization/policyDefinitions";
exports.ASSIGNMENT_TYPE = "Microsoft.Authorization/policyAssignments";
exports.POLICY_OPERATION_CREATE = "CREATE";
exports.POLICY_OPERATION_UPDATE = "UPDATE";
exports.POLICY_OPERATION_NONE = "NONE";
exports.POLICY_RESULT_FAILED = "FAILED";
exports.POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
exports.POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
const POLICY_DEFINITION_NOT_FOUND = "PolicyDefinitionNotFound";
const POLICY_ASSIGNMENT_NOT_FOUND = "PolicyAssignmentNotFound";
const POLICY_METADATA_GITHUB_KEY = "gitHubPolicy";
const POLICY_METADATA_HASH_KEY = "digest";
const ENFORCEMENT_MODE_KEY = "enforcementMode";
const ENFORCEMENT_MODE_ENFORCE = "Default";
const ENFORCEMENT_MODE_DO_NOT_ENFORCE = "DoNotEnforce";
const POLICY_DEFINITION_BUILTIN = "BuiltIn";
function getAllPolicyRequests() {
    return __awaiter(this, void 0, void 0, function* () {
        let policyRequests = [];
        try {
            // Get all policy definition, assignment objects
            const allPolicyDetails = yield getAllPolicyDetails();
            for (const policyDetails of allPolicyDetails) {
                const gitPolicy = policyDetails.policyInCode;
                const currentHash = hashUtils_1.getObjectHash(gitPolicy);
                const azurePolicy = policyDetails.policyInService;
                if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND) {
                    // There was some error while fetching the policy.
                    utilities_1.prettyLog(`Failed to get policy with id ${gitPolicy.id}, path ${policyDetails.path}. Error : ${JSON.stringify(azurePolicy.error)}`);
                }
                else {
                    const operationType = getPolicyOperationType(policyDetails, currentHash);
                    if (operationType == exports.POLICY_OPERATION_CREATE || operationType == exports.POLICY_OPERATION_UPDATE) {
                        policyRequests.push(getPolicyRequest(policyDetails, currentHash, operationType));
                    }
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
function createUpdatePolicies(policyRequests) {
    return __awaiter(this, void 0, void 0, function* () {
        const azHttpClient = new azHttpClient_1.AzHttpClient();
        yield azHttpClient.initialize();
        let policyResults = [];
        // Dividing policy requests into definitions and assignments.
        const definitionRequests = policyRequests.filter(req => req.policy.type == exports.DEFINITION_TYPE);
        const assignmentRequests = policyRequests.filter(req => req.policy.type == exports.ASSIGNMENT_TYPE);
        const definitionResponses = yield azHttpClient.upsertPolicyDefinitions(definitionRequests);
        policyResults.push(...getPolicyResults(definitionRequests, definitionResponses));
        const assignmentResponses = yield azHttpClient.upsertPolicyAssignments(assignmentRequests);
        policyResults.push(...getPolicyResults(assignmentRequests, assignmentResponses));
        return Promise.resolve(policyResults);
    });
}
exports.createUpdatePolicies = createUpdatePolicies;
function getPolicyDefinition(definitionPath) {
    const policyPath = path.join(definitionPath, exports.POLICY_FILE_NAME);
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
    validateDefinition(definition, definitionPath);
    return definition;
}
function getPolicyAssignment(assignmentPath) {
    const assignment = fileHelper_1.getFileJson(assignmentPath);
    if (pathHelper_1.isNonEnforced(assignmentPath)) {
        if (!assignment.properties) {
            assignment.properties = {};
        }
        core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_DO_NOT_ENFORCE}'. Overriding...`);
        assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_DO_NOT_ENFORCE;
    }
    else if (pathHelper_1.isEnforced(assignmentPath)) {
        if (!assignment.properties) {
            assignment.properties = {};
        }
        core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_ENFORCE}'. Overriding...`);
        assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_ENFORCE;
    }
    validateAssignment(assignment, assignmentPath);
    return assignment;
}
function getPolicyResults(policyRequests, policyResponses) {
    let policyResults = [];
    policyRequests.forEach((policyRequest, index) => {
        const isCreate = isCreateOperation(policyRequest);
        const azureResponse = policyResponses[index];
        const policyType = policyRequest.policy.type == exports.DEFINITION_TYPE ? 'definition' : 'assignment';
        const policyDefinitionId = policyRequest.policy.type == exports.DEFINITION_TYPE ? policyRequest.policy.id : policyRequest.policy.properties.policyDefinitionId;
        let status = "";
        let message = "";
        if (!azureResponse) {
            status = exports.POLICY_RESULT_FAILED;
            message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy ${policyType}.`;
        }
        else if (azureResponse.error) {
            status = exports.POLICY_RESULT_FAILED;
            message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy ${policyType}. Error: ${azureResponse.error.message}`;
        }
        else {
            status = exports.POLICY_RESULT_SUCCEEDED;
            message = `Policy ${policyType} ${isCreate ? 'created' : 'updated'} successfully`;
        }
        policyResults.push({
            path: policyRequest.path,
            type: policyRequest.policy.type,
            operation: policyRequest.operation,
            displayName: policyRequest.policy.name,
            status: status,
            message: message,
            policyDefinitionId: policyDefinitionId
        });
    });
    return policyResults;
}
function isCreateOperation(policyRequest) {
    return policyRequest.operation == exports.POLICY_OPERATION_CREATE;
}
function validateDefinition(definition, path) {
    if (!definition.id) {
        throw Error(`Path : ${path}. Property id is missing from the policy definition. Please add id to the policy.json file.`);
    }
    if (!definition.name) {
        throw Error(`Path : ${path}. Property name is missing from the policy definition. Please add name to the policy.json file.`);
    }
    if (!definition.type) {
        throw Error(`Path : ${path}. Property type is missing from the policy definition. Please add type to the policy.json file.`);
    }
}
function validateAssignment(assignment, path) {
    if (!assignment.id) {
        throw Error(`Path : ${path}. Property id is missing from the policy assignment. Please add id to the assignment file.`);
    }
    if (!assignment.name) {
        throw Error(`Path : ${path}. Property name is missing from the policy assignment. Please add name to the assignment file.`);
    }
    if (!assignment.type) {
        throw Error(`Path : ${path}. Property type is missing from the policy assignment. Please add type to the assignment file.`);
    }
}
// Returns all policy definitions and assignments.
function getAllPolicyDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        let allPolicyDetails = [];
        const definitionPaths = pathHelper_1.getAllPolicyDefinitionPaths();
        const assignmentPaths = pathHelper_1.getAllPolicyAssignmentPaths();
        definitionPaths.forEach(definitionPath => {
            const definition = getPolicyDefinition(definitionPath);
            if (definition.properties && definition.properties.policyType == POLICY_DEFINITION_BUILTIN) {
                utilities_1.prettyDebugLog(`Ignoring policy definition with BuiltIn type. Id : ${definition.id}, path : ${definitionPath}`);
            }
            else {
                allPolicyDetails.push({
                    path: definitionPath,
                    policyInCode: definition
                });
            }
        });
        assignmentPaths.forEach(assignmentPath => {
            const assignment = getPolicyAssignment(assignmentPath);
            allPolicyDetails.push({
                path: assignmentPath,
                policyInCode: assignment
            });
        });
        // Fetch policies from service
        const azHttpClient = new azHttpClient_1.AzHttpClient();
        yield azHttpClient.initialize();
        yield azHttpClient.populateServicePolicies(allPolicyDetails);
        return allPolicyDetails;
    });
}
function getWorkflowMetadata(policyHash, filepath) {
    let metadata = {
        digest: policyHash,
        repoName: process.env.GITHUB_REPOSITORY,
        commitSha: process.env.GITHUB_SHA,
        runUrl: utilities_1.getWorkflowRunUrl(),
        filepath: filepath
    };
    return metadata;
}
function getPolicyRequest(policyDetails, hash, operation) {
    let metadata = getWorkflowMetadata(hash, policyDetails.path);
    if (!policyDetails.policyInCode.properties) {
        policyDetails.policyInCode.properties = {};
    }
    if (!policyDetails.policyInCode.properties.metadata) {
        policyDetails.policyInCode.properties.metadata = {};
    }
    policyDetails.policyInCode.properties.metadata[POLICY_METADATA_GITHUB_KEY] = metadata;
    let policyRequest = {
        policy: policyDetails.policyInCode,
        path: policyDetails.path,
        operation: operation
    };
    return policyRequest;
}
/**
 * Helper Method's from here - START
 */
/**
 * This method, for a given policy in GitHub repo path, decides if the policy is a newly Created or will be updated
 *
 * @param policyDetails : Policy Details
 * @param currentHash : Hash of the current policy in GitHub repo
 */
function getPolicyOperationType(policyDetails, currentHash) {
    const policyInCode = policyDetails.policyInCode;
    const policyInService = policyDetails.policyInService;
    if (policyInService.error) {
        //The error here will be 'HTTP - Not Found'. This scenario covers Create a New policy.
        utilities_1.prettyDebugLog(`Policy with id : ${policyInCode.id}, path : ${policyDetails.path} does not exist in azure. A new policy will be created.`);
        return exports.POLICY_OPERATION_CREATE;
    }
    /**
     * Mode can be:
     *  Incremental - Push changes for only the files that have been updated in the commit
     *  Complete    - Ignore updates and push ALL files in the path
     */
    const mode = Inputs.mode;
    let azureHash = getHashFromMetadata(policyInService);
    if (Inputs.MODE_COMPLETE === mode || !azureHash) {
        /**
         * Scenario 1: If user chooses to override logic of hash comparison he can do it via 'mode' == Complete, ALL files in
         *  user defined path will be updated to Azure Policy Service irrespective of Hash match.
         *
         * Scenario 2: If policy file Hash is not available on Policy Service (one such scenario will be the very first time this action
         * is run on an already existing policy) we need to update the file.
         */
        utilities_1.prettyDebugLog(`IgnoreHash is : ${mode} OR GitHub properties/metaData is not present for policy id : ${policyInCode.id}`);
        return exports.POLICY_OPERATION_UPDATE;
    }
    //If user has chosen to push only updated files i.e 'mode' == Incremental AND a valid hash is available in policy metadata compare them.
    utilities_1.prettyDebugLog(`Comparing Hash for policy id : ${policyInCode.id} : ${azureHash === currentHash}`);
    return (azureHash === currentHash) ? exports.POLICY_OPERATION_NONE : exports.POLICY_OPERATION_UPDATE;
}
/**
 * Given a Policy Definition or Policy Assignment this method fetched Hash from metadata
 *
 * @param azurePolicy Azure Policy
 */
function getHashFromMetadata(azurePolicy) {
    const properties = azurePolicy.properties;
    if (!properties || !properties.metadata) {
        return undefined;
    }
    if (!properties.metadata[POLICY_METADATA_GITHUB_KEY] || !properties.metadata[POLICY_METADATA_GITHUB_KEY][POLICY_METADATA_HASH_KEY]) {
        return undefined;
    }
    return properties.metadata[POLICY_METADATA_GITHUB_KEY][POLICY_METADATA_HASH_KEY];
}
/**
 * Helper Method's - END
 */ 
