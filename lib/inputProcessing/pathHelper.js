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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNonEnforced = exports.isEnforced = exports.getAllPolicyAssignmentPaths = exports.getAllInitiativesPaths = exports.getAllPolicyDefinitionPaths = void 0;
const glob = __importStar(require("glob"));
const minimatch_1 = __importDefault(require("minimatch"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const Inputs = __importStar(require("./inputs"));
const policyHelper_1 = require("../azure/policyHelper");
/**
  * @returns All the directories that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match any pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policy.json files.
  */
function getAllPolicyDefinitionPaths() {
    const policyPathsToInclude = getPolicyPathsMatchingPatterns(Inputs.includePathPatterns, policyHelper_1.POLICY_FILE_NAME);
    const policyPathsToExclude = getPolicyPathsMatchingPatterns(Inputs.excludePathPatterns, policyHelper_1.POLICY_FILE_NAME);
    return policyPathsToInclude.filter(p => !policyPathsToExclude.includes(p));
}
exports.getAllPolicyDefinitionPaths = getAllPolicyDefinitionPaths;
/**
  * @returns All the directories that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match any pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policyset.json files.
  */
function getAllInitiativesPaths() {
    const policyPathsToInclude = getPolicyPathsMatchingPatterns(Inputs.includePathPatterns, policyHelper_1.POLICY_INITIATIVE_FILE_NAME);
    const policyPathsToExclude = getPolicyPathsMatchingPatterns(Inputs.excludePathPatterns, policyHelper_1.POLICY_INITIATIVE_FILE_NAME);
    return policyPathsToInclude.filter(p => !policyPathsToExclude.includes(p));
}
exports.getAllInitiativesPaths = getAllInitiativesPaths;
/**
  * @returns All the files that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policy.json as a sibling.
  *          4) File name matches any pattern given in assignments input.
  */
function getAllPolicyAssignmentPaths() {
    return getAssignmentPathsMatchingPatterns(Inputs.includePathPatterns, Inputs.assignmentPatterns);
}
exports.getAllPolicyAssignmentPaths = getAllPolicyAssignmentPaths;
function isEnforced(assignmentPath) {
    return Inputs.enforcePatterns.some(pattern => {
        return minimatch_1.default(assignmentPath, pattern, { dot: true, matchBase: true });
    });
}
exports.isEnforced = isEnforced;
function isNonEnforced(assignmentPath) {
    return Inputs.doNotEnforcePatterns.some(pattern => {
        return minimatch_1.default(assignmentPath, pattern, { dot: true, matchBase: true });
    });
}
exports.isNonEnforced = isNonEnforced;
function getPolicyPathsMatchingPatterns(patterns, policyFileName) {
    let matchingPolicyPaths = [];
    patterns.forEach(pattern => {
        const policyFilePattern = path.join(pattern, policyFileName);
        const policyFiles = getFilesMatchingPattern(policyFilePattern);
        core.debug(`Policy file pattern: ${policyFilePattern}\n Matching policy paths: ${policyFiles}`);
        matchingPolicyPaths.push(...policyFiles.map(policyFile => path.dirname(policyFile)));
    });
    return getUniquePaths(matchingPolicyPaths);
}
function getAssignmentPathsMatchingPatterns(patterns, assignmentPatterns) {
    let matchingAssignmentPaths = [];
    patterns.forEach(policyPath => {
        assignmentPatterns.forEach(assignmentPattern => {
            const pattern = path.join(policyPath, assignmentPattern);
            const assignmentPaths = getFilesMatchingPattern(pattern);
            core.debug(`Assignment pattern: ${pattern}\n Matching assignment paths: ${assignmentPaths}`);
            matchingAssignmentPaths.push(...assignmentPaths);
        });
    });
    return getUniquePaths(matchingAssignmentPaths);
}
function getFilesMatchingPattern(pattern) {
    return glob.sync(pattern, { dot: true });
}
function getUniquePaths(paths) {
    return [...new Set(paths)];
}
