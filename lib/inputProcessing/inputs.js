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
exports.readInputs = exports.doNotEnforcePatterns = exports.enforcePatterns = exports.excludeAssignmentPatterns = exports.includeAssignmentPatterns = exports.excludePathPatterns = exports.includePathPatterns = exports.mode = exports.enforcementMode = exports.assignments = exports.ignorePaths = exports.paths = exports.MODE_COMPLETE = exports.MODE_INCREMENTAL = void 0;
const core = __importStar(require("@actions/core"));
const INPUT_PATHS_KEY = 'paths';
const INPUT_IGNORE_PATHS_KEY = 'ignore-paths';
const INPUT_ASSIGNMENTS_KEY = 'assignments';
const INPUT_ENFORCEMENT_MODE_KEY = 'enforce';
const INPUT_MODE = "mode";
const EXCLUDE_PREFIX = '!';
const DEFAULT_ASSIGNMENT_PATTERN = 'assign.*.json';
exports.MODE_INCREMENTAL = "incremental";
exports.MODE_COMPLETE = "complete";
exports.mode = exports.MODE_INCREMENTAL;
exports.includePathPatterns = [];
exports.excludePathPatterns = [];
exports.includeAssignmentPatterns = [];
exports.excludeAssignmentPatterns = [];
exports.enforcePatterns = [];
exports.doNotEnforcePatterns = [];
function readInputs() {
    const pathsInput = core.getInput(INPUT_PATHS_KEY, { required: true });
    const ignorePathsInput = core.getInput(INPUT_IGNORE_PATHS_KEY);
    const assignmentsInput = core.getInput(INPUT_ASSIGNMENTS_KEY);
    const enforcementModeInput = core.getInput(INPUT_ENFORCEMENT_MODE_KEY);
    exports.mode = core.getInput(INPUT_MODE) ? core.getInput(INPUT_MODE).toLowerCase() : exports.MODE_INCREMENTAL;
    exports.paths = getInputArray(pathsInput);
    exports.ignorePaths = getInputArray(ignorePathsInput);
    exports.assignments = getInputArray(assignmentsInput);
    exports.enforcementMode = getInputArray(enforcementModeInput);
    validateAssignments();
    validateEnforcementMode();
    exports.paths.forEach(path => {
        isExcludeInput(path) ? exports.excludePathPatterns.push(path.substring(1)) : exports.includePathPatterns.push(path);
    });
    if (exports.ignorePaths) {
        exports.ignorePaths.forEach(ignorePath => {
            exports.excludePathPatterns.push(ignorePath);
        });
    }
    if (exports.assignments) {
        exports.assignments.forEach(assignment => {
            isExcludeInput(assignment) ? exports.excludeAssignmentPatterns.push(assignment.substring(1)) : exports.includeAssignmentPatterns.push(assignment);
        });
    }
    if (exports.includeAssignmentPatterns.length == 0) {
        exports.includeAssignmentPatterns.push(DEFAULT_ASSIGNMENT_PATTERN);
    }
    if (exports.enforcementMode) {
        exports.enforcementMode.forEach(enforcementMode => {
            isExcludeInput(enforcementMode)
                ? exports.doNotEnforcePatterns.push(enforcementMode.substring(1))
                : exports.enforcePatterns.push(enforcementMode);
        });
    }
}
exports.readInputs = readInputs;
function getInputArray(input) {
    return input ? input.split('\n') : undefined;
}
function isExcludeInput(input) {
    return input.startsWith(EXCLUDE_PREFIX);
}
function validateAssignments() {
    if (exports.assignments && hasGlobStarPattern(exports.assignments)) {
        throw Error(`Input '${INPUT_ASSIGNMENTS_KEY}' should not contain globstar pattern '**'.`);
    }
}
function validateEnforcementMode() {
    if (exports.enforcementMode && hasGlobStarPattern(exports.enforcementMode)) {
        throw Error(`Input '${INPUT_ENFORCEMENT_MODE_KEY}' should not contain globstar pattern '**'.`);
    }
}
function hasGlobStarPattern(patterns) {
    return patterns.some(pattern => {
        return pattern.includes('**');
    });
}
