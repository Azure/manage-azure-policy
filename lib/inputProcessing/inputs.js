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
exports.readInputs = exports.doNotEnforcePatterns = exports.enforcePatterns = exports.assignmentPatterns = exports.excludePathPatterns = exports.includePathPatterns = exports.mode = exports.enforcementMode = exports.assignments = exports.ignorePaths = exports.paths = exports.MODE_COMPLETE = exports.MODE_INCREMENTAL = exports.INPUT_MODE = void 0;
const core = __importStar(require("@actions/core"));
const INPUT_PATHS_KEY = 'paths';
const INPUT_IGNORE_PATHS_KEY = 'ignore-paths';
const INPUT_ASSIGNMENTS_KEY = 'assignments';
const INPUT_ENFORCEMENT_MODE_KEY = 'enforce';
exports.INPUT_MODE = "mode";
const DO_NOT_ENFORCE_PREFIX = '~';
const DEFAULT_ASSIGNMENT_PATTERN = 'assign.*.json';
exports.MODE_INCREMENTAL = "incremental";
exports.MODE_COMPLETE = "complete";
exports.mode = exports.MODE_INCREMENTAL;
exports.includePathPatterns = [];
exports.excludePathPatterns = [];
exports.assignmentPatterns = [];
exports.enforcePatterns = [];
exports.doNotEnforcePatterns = [];
function readInputs() {
    const pathsInput = core.getInput(INPUT_PATHS_KEY, { required: true });
    const ignorePathsInput = core.getInput(INPUT_IGNORE_PATHS_KEY);
    const assignmentsInput = core.getInput(INPUT_ASSIGNMENTS_KEY);
    const enforcementModeInput = core.getInput(INPUT_ENFORCEMENT_MODE_KEY);
    exports.mode = core.getInput(exports.INPUT_MODE) ? core.getInput(exports.INPUT_MODE).toLowerCase() : exports.MODE_INCREMENTAL;
    exports.paths = getInputArray(pathsInput);
    exports.ignorePaths = getInputArray(ignorePathsInput);
    exports.assignments = getInputArray(assignmentsInput);
    exports.enforcementMode = getInputArray(enforcementModeInput);
    validateAssignments();
    validateEnforcementMode();
    exports.paths.forEach(path => {
        exports.includePathPatterns.push(path);
    });
    if (exports.ignorePaths) {
        exports.ignorePaths.forEach(ignorePath => {
            exports.excludePathPatterns.push(ignorePath);
        });
    }
    if (exports.assignments) {
        exports.assignments.forEach(assignment => {
            exports.assignmentPatterns.push(assignment);
        });
    }
    if (exports.assignmentPatterns.length == 0) {
        exports.assignmentPatterns.push(DEFAULT_ASSIGNMENT_PATTERN);
    }
    if (exports.enforcementMode) {
        exports.enforcementMode.forEach(enforcementMode => {
            enforcementMode.startsWith(DO_NOT_ENFORCE_PREFIX)
                ? exports.doNotEnforcePatterns.push(enforcementMode.substring(1))
                : exports.enforcePatterns.push(enforcementMode);
        });
    }
}
exports.readInputs = readInputs;
function getInputArray(input) {
    return input ? input.split('\n').map(item => item.trim()) : undefined;
}
function validateAssignments() {
    validateAssignmentLikePatterns(INPUT_ASSIGNMENTS_KEY, exports.assignments);
}
function validateEnforcementMode() {
    validateAssignmentLikePatterns(INPUT_ENFORCEMENT_MODE_KEY, exports.enforcementMode);
}
function validateAssignmentLikePatterns(inputName, patterns) {
    if (!patterns) {
        return;
    }
    if (hasSlashInPattern(patterns)) {
        throw Error(`Input '${inputName}' should not contain directory separator '/' in any pattern.`);
    }
    if (hasGlobStarPattern(patterns)) {
        throw Error(`Input '${inputName}' should not contain globstar '**' in any pattern.`);
    }
}
function hasSlashInPattern(patterns) {
    return patterns.some(pattern => {
        return pattern.includes('/');
    });
}
function hasGlobStarPattern(patterns) {
    return patterns.some(pattern => {
        return pattern.includes('**');
    });
}
