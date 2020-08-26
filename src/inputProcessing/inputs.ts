import * as core from '@actions/core';

const INPUT_PATHS_KEY = 'paths';
const INPUT_IGNORE_PATHS_KEY = 'ignore-paths';
const INPUT_ASSIGNMENTS_KEY = 'assignments';
const INPUT_ENFORCEMENT_MODE_KEY = 'enforcement-mode';
const INPUT_MODE = "mode";
const EXCLUDE_PREFIX = '!';
const DEFAULT_ASSIGNMENT_PATTERN = 'assign.*.json';
export const MODE_INCREMENTAL = "incremental";
export const MODE_COMPLETE = "complete";

export let paths: string[];
export let ignorePaths: string[] | undefined;
export let assignments: string[] | undefined;
export let enforcementMode: string[] | undefined;
export let mode: string = MODE_INCREMENTAL;

export let includePathPatterns: string[] = [];
export let excludePathPatterns: string[] = [];
export let includeAssignmentPatterns: string[] = [];
export let excludeAssignmentPatterns: string[] = [];
export let enforcePatterns: string[] = [];
export let doNotEnforcePatterns: string[] = [];

export function readInputs() {
  const pathsInput = core.getInput(INPUT_PATHS_KEY, { required: true });
  const ignorePathsInput = core.getInput(INPUT_IGNORE_PATHS_KEY);
  const assignmentsInput = core.getInput(INPUT_ASSIGNMENTS_KEY);
  const enforcementModeInput = core.getInput(INPUT_ENFORCEMENT_MODE_KEY);
  mode = core.getInput(INPUT_MODE) ? core.getInput(INPUT_MODE).toLowerCase() : MODE_INCREMENTAL;

  paths = getInputArray(pathsInput);
  ignorePaths = getInputArray(ignorePathsInput);
  assignments = getInputArray(assignmentsInput);
  enforcementMode = getInputArray(enforcementModeInput);

  validateAssignments();
  validateEnforcementMode();
  
  paths.forEach(path => {
    isExcludeInput(path) ? excludePathPatterns.push(path.substring(1)) : includePathPatterns.push(path);
  });

  if (ignorePaths) {
    ignorePaths.forEach(ignorePath => {
      excludePathPatterns.push(ignorePath);
    })
  }

  if (assignments) {
    assignments.forEach(assignment => {
      isExcludeInput(assignment) ? excludeAssignmentPatterns.push(assignment.substring(1)) : includeAssignmentPatterns.push(assignment);
    });
  }

  if (includeAssignmentPatterns.length == 0) {
    includeAssignmentPatterns.push(DEFAULT_ASSIGNMENT_PATTERN);
  }

  if (enforcementMode) {
    enforcementMode.forEach(enforcementMode => {
      isExcludeInput(enforcementMode)
        ? doNotEnforcePatterns.push(enforcementMode.substring(1))
        : enforcePatterns.push(enforcementMode);
    });
  }
}

function getInputArray(input: string): string[] | undefined {
  return input ? input.split('\n') : undefined;
}

function isExcludeInput(input: string): boolean {
  return input.startsWith(EXCLUDE_PREFIX);
}

function validateAssignments(): void {
  if (assignments && hasGlobStarPattern(assignments)) {
    throw Error(`Input '${INPUT_ASSIGNMENTS_KEY}' should not contain globstar pattern '**'.`);
  }
}

function validateEnforcementMode(): void {
  if (enforcementMode && hasGlobStarPattern(enforcementMode)) {
    throw Error(`Input '${INPUT_ENFORCEMENT_MODE_KEY}' should not contain globstar pattern '**'.`);
  }
}

function hasGlobStarPattern(patterns: string[]): boolean {
  return patterns.some(pattern => {
    return pattern.includes('**');
  });
}