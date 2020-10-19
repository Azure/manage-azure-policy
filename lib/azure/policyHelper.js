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
exports.createUpdatePolicies = exports.getAllPolicyRequests = exports.FRIENDLY_ASSIGNMENT_TYPE = exports.FRIENDLY_INITIATIVE_TYPE = exports.FRIENDLY_DEFINITION_TYPE = exports.POLICY_INITIATIVE_FILE_NAME = exports.POLICY_FILE_NAME = exports.POLICY_RESULT_SUCCEEDED = exports.POLICY_RESULT_FAILED = exports.POLICY_OPERATION_NONE = exports.POLICY_OPERATION_UPDATE = exports.POLICY_OPERATION_CREATE = exports.ROLE_ASSIGNMNET_TYPE = exports.ASSIGNMENT_TYPE = exports.INITIATIVE_TYPE = exports.DEFINITION_TYPE = void 0;
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const azHttpClient_1 = require("./azHttpClient");
const httpClient_1 = require("../utils/httpClient");
const fileHelper_1 = require("../utils/fileHelper");
const hashUtils_1 = require("../utils/hashUtils");
const utilities_1 = require("../utils/utilities");
const pathHelper_1 = require("../inputProcessing/pathHelper");
const Inputs = __importStar(require("../inputProcessing/inputs"));
const uuid_1 = require("uuid");
exports.DEFINITION_TYPE = "Microsoft.Authorization/policyDefinitions";
exports.INITIATIVE_TYPE = "Microsoft.Authorization/policySetDefinitions";
exports.ASSIGNMENT_TYPE = "Microsoft.Authorization/policyAssignments";
exports.ROLE_ASSIGNMNET_TYPE = "Microsoft.Authorization/roleAssignments";
exports.POLICY_OPERATION_CREATE = "CREATE";
exports.POLICY_OPERATION_UPDATE = "UPDATE";
exports.POLICY_OPERATION_NONE = "NONE";
exports.POLICY_RESULT_FAILED = "FAILED";
exports.POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
exports.POLICY_FILE_NAME = "policy.json";
exports.POLICY_INITIATIVE_FILE_NAME = "policyset.json";
exports.FRIENDLY_DEFINITION_TYPE = "definition";
exports.FRIENDLY_INITIATIVE_TYPE = "initiative";
exports.FRIENDLY_ASSIGNMENT_TYPE = "assignment";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";
const INITIATIVE_PARAMETERS_FILE_NAME = "policyset.parameters.json";
const INITIATIVE_DEFINITIONS_FILE_NAME = "policyset.definitions.json";
const POLICY_DEFINITION_NOT_FOUND = "PolicyDefinitionNotFound";
const POLICY_ASSIGNMENT_NOT_FOUND = "PolicyAssignmentNotFound";
const POLICY_INITIATIVE_NOT_FOUND = "PolicySetDefinitionNotFound";
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
                if (azurePolicy.error && azurePolicy.error.code != POLICY_DEFINITION_NOT_FOUND && azurePolicy.error.code != POLICY_ASSIGNMENT_NOT_FOUND && azurePolicy.error.code != POLICY_INITIATIVE_NOT_FOUND) {
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
        // Dividing policy requests into definitions, initiatives and assignments.
        const [definitionRequests, initiativeRequests, assignmentRequests] = dividePolicyRequests(policyRequests);
        const definitionResponses = yield azHttpClient.upsertPolicyDefinitions(definitionRequests);
        policyResults.push(...getPolicyResults(definitionRequests, definitionResponses, exports.FRIENDLY_DEFINITION_TYPE));
        const initiativeResponses = yield azHttpClient.upsertPolicyInitiatives(initiativeRequests);
        policyResults.push(...getPolicyResults(initiativeRequests, initiativeResponses, exports.FRIENDLY_INITIATIVE_TYPE));
        const assignmentResponses = yield azHttpClient.upsertPolicyAssignments(assignmentRequests);
        policyResults.push(...getPolicyResults(assignmentRequests, assignmentResponses, exports.FRIENDLY_ASSIGNMENT_TYPE));
        // Now we need to add roles to managed identity for policy remediation.
        yield assignRoles(assignmentRequests, assignmentResponses, policyResults);
        return Promise.resolve(policyResults);
    });
}
exports.createUpdatePolicies = createUpdatePolicies;
function dividePolicyRequests(policyRequests) {
    let definitionRequests = [];
    let initiativeRequests = [];
    let assignmentRequests = [];
    policyRequests.forEach(policyRequest => {
        switch (policyRequest.policy.type) {
            case exports.DEFINITION_TYPE:
                definitionRequests.push(policyRequest);
                break;
            case exports.INITIATIVE_TYPE:
                initiativeRequests.push(policyRequest);
                break;
            case exports.ASSIGNMENT_TYPE:
                assignmentRequests.push(policyRequest);
                break;
            default:
                utilities_1.prettyDebugLog(`Unknown type for policy in path : ${policyRequest.path}`);
        }
    });
    return [definitionRequests, initiativeRequests, assignmentRequests];
}
function assignRoles(assignmentRequests, assignmentResponses, roleAssignmentResults) {
    return __awaiter(this, void 0, void 0, function* () {
        let roleRequests = [];
        // create map of definition id to definition for all definitions in code
        let definitionsMap = new Map();
        const definitions = getAllPolicyDefinitions();
        definitions.forEach(definition => definitionsMap.set(definition.policyInCode.id, definition.policyInCode));
        let pendingAssignments = [];
        for (let index = 0; index < assignmentRequests.length; index++) {
            const policyAssignment = assignmentResponses[index];
            // We will assign roles only when assignmnet was created and has identity field has principalId in it.
            if (isCreateOperation(assignmentRequests[index]) && policyAssignment.identity && policyAssignment.identity.principalId) {
                // Now we need roleDefinitionIds. We will try to get it from repo else we will make azure api call to get definition.
                const definition = definitionsMap.get(policyAssignment.properties.policyDefinitionId);
                if (definition) {
                    roleRequests.push(...getRoleRequest(definition, policyAssignment));
                }
                else {
                    pendingAssignments.push(policyAssignment);
                }
            }
        }
        if (pendingAssignments.length > 0) {
            // For missing policy definitions get them from azure
            utilities_1.prettyDebugLog(`There are ${pendingAssignments.length} assignments for which definitions needs to be fetched from azure.`);
            const missingDefinitionIds = pendingAssignments.map(assignment => assignment.properties.policyDefinitionId);
            try {
                const azHttpClient = new azHttpClient_1.AzHttpClient();
                yield azHttpClient.initialize();
                let missingDefinitions = yield azHttpClient.getPolicyDefintions(missingDefinitionIds);
                for (let index = 0; index < pendingAssignments.length; index++) {
                    const policyAssignment = pendingAssignments[index];
                    const policyDefinition = missingDefinitions[index];
                    if (policyDefinition.error) {
                        roleAssignmentResults.push({
                            path: "NA",
                            type: exports.ROLE_ASSIGNMNET_TYPE,
                            operation: exports.POLICY_OPERATION_CREATE,
                            displayName: `Role Assignment for policy policy assignment id : ${policyAssignment.id}`,
                            status: exports.POLICY_RESULT_FAILED,
                            message: policyDefinition.error.message ? policyDefinition.error.message : "Could not get policy definition from Azure",
                            policyDefinitionId: policyAssignment.properties.policyDefinitionId
                        });
                    }
                    else {
                        roleRequests.push(...getRoleRequest(policyDefinition, policyAssignment));
                    }
                }
            }
            catch (error) {
                utilities_1.prettyDebugLog(`An error occurred while getting role requests for missing policy definitions. Error : ${error}`);
                throw new Error(`An error occurred while getting role requests for missing policy definitions. Error: ${error}`);
            }
        }
        yield createRoleRequests(roleRequests, roleAssignmentResults);
    });
}
function createRoleRequests(roleRequests, roleAssignmentResults) {
    return __awaiter(this, void 0, void 0, function* () {
        if (roleRequests.length == 0) {
            utilities_1.prettyDebugLog(`No role assignments needs to be created`);
            return;
        }
        // // Wait for some time before creating
        // prettyDebugLog(`wait for 60s`);
        // sleepFor(60);
        try {
            const azHttpClient = new azHttpClient_1.AzHttpClient();
            yield azHttpClient.initialize();
            let responses = yield azHttpClient.addRoleAssinments(roleRequests);
            // verify responses
            responses.forEach((response, index) => {
                if (response.httpStatusCode == httpClient_1.StatusCodes.CREATED) {
                    utilities_1.prettyDebugLog(`Role assignment created with id ${response.content.id} for assignmentId : ${roleRequests[index].policyAssignmentId}`);
                    roleAssignmentResults.push({
                        path: "NA",
                        type: exports.ROLE_ASSIGNMNET_TYPE,
                        operation: exports.POLICY_OPERATION_CREATE,
                        displayName: `Role Assignment for policy assignment id : ${roleRequests[index].policyAssignmentId}`,
                        status: exports.POLICY_RESULT_SUCCEEDED,
                        message: `Role Assignment created with id : ${response.content.id}`,
                        policyDefinitionId: roleRequests[index].policyDefinitionId
                    });
                }
                else {
                    utilities_1.prettyLog(`Role assignment could not be created related to assignment id ${roleRequests[index].policyAssignmentId}. Status : ${response.httpStatusCode}`);
                    roleAssignmentResults.push({
                        path: "NA",
                        type: exports.ROLE_ASSIGNMNET_TYPE,
                        operation: exports.POLICY_OPERATION_CREATE,
                        displayName: `Role Assignment for policy assignment id : ${roleRequests[index].policyAssignmentId}`,
                        status: exports.POLICY_RESULT_FAILED,
                        message: response.content.error ? response.content.error.message : `Role Assignment could not be created. Status : ${response.httpStatusCode}`,
                        policyDefinitionId: roleRequests[index].policyDefinitionId
                    });
                }
            });
        }
        catch (error) {
            utilities_1.prettyLog(`An error occurred while creating role assignments. Error: ${error}`);
            throw new Error(`An error occurred while creating role assignments. Error: ${error}`);
        }
    });
}
function getRoleRequest(policyDefinition, assignment) {
    let roleRequests = [];
    let roleDefinitionIds = getRoleDefinitionIds(policyDefinition);
    if (roleDefinitionIds && roleDefinitionIds.length > 0) {
        roleDefinitionIds.forEach(roleDefinitionId => {
            // We need last part of role definition id
            let roleDefId = roleDefinitionId.split("/").pop();
            roleRequests.push({
                scope: assignment.properties.scope,
                roleAssignmentId: uuid_1.v4(),
                roleDefinitionId: roleDefId,
                principalId: assignment.identity.principalId,
                policyAssignmentId: assignment.id,
                policyDefinitionId: policyDefinition.id
            });
        });
    }
    else {
        // Here we should add some entry in logs
        utilities_1.prettyLog(`Could not find role definition ids for adding role assignments to the managed identity. Assignment Id : ${assignment.id}`);
    }
    return roleRequests;
}
function getRoleDefinitionIds(policyDefinition) {
    if (policyDefinition.properties
        && policyDefinition.properties.policyRule
        && policyDefinition.properties.policyRule.then
        && policyDefinition.properties.policyRule.then.details
        && policyDefinition.properties.policyRule.then.details.roleDefinitionIds) {
        return policyDefinition.properties.policyRule.then.details.roleDefinitionIds;
    }
    return undefined;
}
function getPolicyDefinition(definitionPath) {
    const policyPath = path.join(definitionPath, exports.POLICY_FILE_NAME);
    const policyRulesPath = path.join(definitionPath, POLICY_RULES_FILE_NAME);
    const policyParametersPath = path.join(definitionPath, POLICY_PARAMETERS_FILE_NAME);
    let definition = fileHelper_1.getFileJson(policyPath);
    validatePolicy(definition, definitionPath, exports.FRIENDLY_DEFINITION_TYPE);
    if (!definition.properties)
        definition.properties = {};
    if (!definition.properties.policyRule)
        utilities_1.populatePropertyFromJsonFile(definition.properties, policyRulesPath, "policyRule");
    if (!definition.properties.parameters)
        utilities_1.populatePropertyFromJsonFile(definition.properties, policyParametersPath, "parameters");
    return definition;
}
function getPolicyInitiative(initiativePath) {
    const initiativeFilePath = path.join(initiativePath, exports.POLICY_INITIATIVE_FILE_NAME);
    const initiativeDefinitionsPath = path.join(initiativePath, INITIATIVE_DEFINITIONS_FILE_NAME);
    const initiativeParametersPath = path.join(initiativePath, INITIATIVE_PARAMETERS_FILE_NAME);
    let initiative = fileHelper_1.getFileJson(initiativeFilePath);
    validatePolicy(initiative, initiativePath, exports.FRIENDLY_INITIATIVE_TYPE);
    if (!initiative.properties)
        initiative.properties = {};
    if (!initiative.properties.policyDefinitions)
        utilities_1.populatePropertyFromJsonFile(initiative.properties, initiativeDefinitionsPath, "policyDefinitions");
    if (!initiative.properties.parameters)
        utilities_1.populatePropertyFromJsonFile(initiative.properties, initiativeParametersPath, "parameters");
    return initiative;
}
function getPolicyAssignment(assignmentPath) {
    const assignment = fileHelper_1.getFileJson(assignmentPath);
    validatePolicy(assignment, assignmentPath, exports.FRIENDLY_ASSIGNMENT_TYPE);
    if (!assignment.properties) {
        assignment.properties = {};
    }
    if (pathHelper_1.isNonEnforced(assignmentPath)) {
        core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_DO_NOT_ENFORCE}'. Overriding...`);
        assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_DO_NOT_ENFORCE;
    }
    else if (pathHelper_1.isEnforced(assignmentPath)) {
        core.debug(`Assignment path: ${assignmentPath} matches enforcementMode pattern for '${ENFORCEMENT_MODE_ENFORCE}'. Overriding...`);
        assignment.properties[ENFORCEMENT_MODE_KEY] = ENFORCEMENT_MODE_ENFORCE;
    }
    return assignment;
}
function getPolicyResults(policyRequests, policyResponses, policyType) {
    let policyResults = [];
    policyRequests.forEach((policyRequest, index) => {
        const isCreate = isCreateOperation(policyRequest);
        const azureResponse = policyResponses[index];
        const policyDefinitionId = policyRequest.policy.type == exports.ASSIGNMENT_TYPE ? policyRequest.policy.properties.policyDefinitionId : policyRequest.policy.id;
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
function validatePolicy(policy, path, type) {
    if (!policy) {
        throw Error(`Path : ${path}. JSON file is invalid.`);
    }
    if (!policy.id) {
        throw Error(`Path : ${path}. Property id is missing from the policy ${type}. Please add id to the ${type} file.`);
    }
    if (!policy.name) {
        throw Error(`Path : ${path}. Property name is missing from the policy ${type}. Please add name to the ${type} file.`);
    }
    if (!policy.type) {
        throw Error(`Path : ${path}. Property type is missing from the policy ${type}. Please add type to the ${type} file.`);
    }
}
// Returns all policy definitions and assignments.
function getAllPolicyDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        let allPolicyDetails = [];
        allPolicyDetails.push(...getAllPolicyDefinitions());
        const initiativePaths = pathHelper_1.getAllInitiativesPaths();
        const assignmentPaths = pathHelper_1.getAllPolicyAssignmentPaths();
        initiativePaths.forEach(initiativePath => {
            const initiativeDetails = getPolicyDetails(initiativePath, exports.INITIATIVE_TYPE);
            if (!!initiativeDetails) {
                allPolicyDetails.push(initiativeDetails);
            }
        });
        assignmentPaths.forEach(assignmentPath => {
            const assignmentDetails = getPolicyDetails(assignmentPath, exports.ASSIGNMENT_TYPE);
            if (!!assignmentDetails) {
                allPolicyDetails.push(assignmentDetails);
            }
        });
        // Fetch policies from service
        const azHttpClient = new azHttpClient_1.AzHttpClient();
        yield azHttpClient.initialize();
        yield azHttpClient.populateServicePolicies(allPolicyDetails);
        return allPolicyDetails;
    });
}
function getAllPolicyDefinitions() {
    let policyDefinitions = [];
    const definitionPaths = pathHelper_1.getAllPolicyDefinitionPaths();
    definitionPaths.forEach(definitionPath => {
        const definitionDetails = getPolicyDetails(definitionPath, exports.DEFINITION_TYPE);
        if (!!definitionDetails) {
            policyDefinitions.push(definitionDetails);
        }
    });
    return policyDefinitions;
}
function getPolicyDetails(policyPath, policyType) {
    let policyDetails = {};
    let policy;
    try {
        switch (policyType) {
            case exports.DEFINITION_TYPE:
                policy = getPolicyDefinition(policyPath);
                break;
            case exports.INITIATIVE_TYPE:
                policy = getPolicyInitiative(policyPath);
                break;
            case exports.ASSIGNMENT_TYPE:
                policy = getPolicyAssignment(policyPath);
                break;
        }
        // For definitions and initiatives we have policyType field. For assignment this field is not present so it will be ignored.
        if (policy.properties && policy.properties.policyType == POLICY_DEFINITION_BUILTIN) {
            utilities_1.prettyDebugLog(`Ignoring policy with BuiltIn type. Id : ${policy.id}, path : ${policyPath}`);
            policyDetails = undefined;
        }
        else {
            policyDetails.path = policyPath;
            policyDetails.policyInCode = policy;
        }
    }
    catch (error) {
        utilities_1.prettyLog(`Error occured while reading policy in path : ${policyPath}. Error : ${error}`);
        policyDetails = undefined;
    }
    return policyDetails;
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
