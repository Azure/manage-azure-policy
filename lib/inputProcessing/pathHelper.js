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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPolicyAssignmentPaths = exports.getAllPolicyDefinitionPaths = void 0;
const glob = __importStar(require("glob"));
const path = __importStar(require("path"));
const Inputs = __importStar(require("./inputs"));
const policyHelper_1 = require("../azure/policyHelper");
/**
  * @returns All the directories that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match any pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policy.json files.
  */
function getAllPolicyDefinitionPaths() {
    const policyPathsToInclude = getPolicyPathsMatchingPatterns(Inputs.includePathPatterns);
    const policyPathsToExclude = getPolicyPathsMatchingPatterns(Inputs.excludePathPatterns);
    return policyPathsToInclude.filter(p => !policyPathsToExclude.includes(p));
}
exports.getAllPolicyDefinitionPaths = getAllPolicyDefinitionPaths;
/**
  * @returns All the files that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policy.json as a sibling.
  *          4) File name matches any pattern given in assignments input.
  */
function getAllPolicyAssignmentPaths(allPolicyDefinitionPaths) {
    const assignmentPathsToInclude = getAssignmentPathsMatchingPatterns(allPolicyDefinitionPaths, Inputs.includeAssignmentPatterns);
    const assignmentPathsToExclude = getAssignmentPathsMatchingPatterns(allPolicyDefinitionPaths, Inputs.excludeAssignmentPatterns);
    return assignmentPathsToInclude.filter(a => !assignmentPathsToExclude.includes(a));
}
exports.getAllPolicyAssignmentPaths = getAllPolicyAssignmentPaths;
function getPolicyPathsMatchingPatterns(patterns) {
    let matchingPolicyPaths = [];
    patterns.forEach(pattern => {
        const policyFilePattern = path.join(pattern, policyHelper_1.POLICY_FILE_NAME);
        const policyFiles = getFilesMatchingPattern(policyFilePattern);
        matchingPolicyPaths.push(...policyFiles.map(policyFile => path.dirname(policyFile)));
    });
    return getUniquePaths(matchingPolicyPaths);
}
function getAssignmentPathsMatchingPatterns(allPolicyDefinitionPaths, assignmentPatterns) {
    let matchingAssignmentPaths = [];
    allPolicyDefinitionPaths.forEach(policyPath => {
        assignmentPatterns.forEach(assignmentPattern => {
            const assignmentPaths = getFilesMatchingPattern(path.join(policyPath, assignmentPattern));
            matchingAssignmentPaths.push(...assignmentPaths);
        });
    });
    return getUniquePaths(matchingAssignmentPaths);
}
function getFilesMatchingPattern(pattern) {
    return glob.sync(pattern);
}
function getUniquePaths(paths) {
    return [...new Set(paths)];
}
