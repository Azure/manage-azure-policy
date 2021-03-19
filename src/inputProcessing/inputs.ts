import * as core from '@actions/core';

const INPUT_PATHS_KEY = 'paths';
const INPUT_IGNORE_PATHS_KEY = 'ignore-paths';
const INPUT_ASSIGNMENTS_KEY = 'assignments';
const INPUT_ENFORCEMENT_MODE_KEY = 'enforce';
const FORCE_UPDATE_KEY = "force-update";
export const INPUT_MODE = "mode";
const DO_NOT_ENFORCE_PREFIX = '~';
const DEFAULT_ASSIGNMENT_PATTERN = 'assign.*.json';
export const MODE_INCREMENTAL = "incremental";
export const MODE_COMPLETE = "complete";

export let paths: string[];
export let ignorePaths: string[] | undefined;
export let assignments: string[] | undefined;
export let enforcementMode: string[] | undefined;
export let mode: string = MODE_INCREMENTAL;
export let forceUpdate: boolean = false;

export let includePathPatterns: string[] = [];
export let excludePathPatterns: string[] = [];
export let assignmentPatterns: string[] = [];
export let enforcePatterns: string[] = [];
export let doNotEnforcePatterns: string[] = [];

export function readInputs() {
  const pathsInput = core.getInput(INPUT_PATHS_KEY, { required: true });
  const ignorePathsInput = core.getInput(INPUT_IGNORE_PATHS_KEY);
  const assignmentsInput = core.getInput(INPUT_ASSIGNMENTS_KEY);
  const enforcementModeInput = core.getInput(INPUT_ENFORCEMENT_MODE_KEY);
  mode = core.getInput(INPUT_MODE) ? core.getInput(INPUT_MODE).toLowerCase() : MODE_INCREMENTAL;
  forceUpdate = core.getInput(FORCE_UPDATE_KEY) ? core.getInput(FORCE_UPDATE_KEY).toLowerCase() == "true" : false;

  paths = getInputArray(pathsInput);
  ignorePaths = getInputArray(ignorePathsInput);
  assignments = getInputArray(assignmentsInput);
  enforcementMode = getInputArray(enforcementModeInput);

  validateAssignments();
  validateEnforcementMode();

  paths.forEach(path => {
    includePathPatterns.push(path);
  });

  if (ignorePaths) {
    ignorePaths.forEach(ignorePath => {
      excludePathPatterns.push(ignorePath);
    })
  }

  if (assignments) {
    assignments.forEach(assignment => {
      assignmentPatterns.push(assignment);
    });
  }

  if (assignmentPatterns.length == 0) {
    assignmentPatterns.push(DEFAULT_ASSIGNMENT_PATTERN);
  }

  if (enforcementMode) {
    enforcementMode.forEach(enforcementMode => {
      enforcementMode.startsWith(DO_NOT_ENFORCE_PREFIX)
        ? doNotEnforcePatterns.push(enforcementMode.substring(1))
        : enforcePatterns.push(enforcementMode);
    });
  }
}

export function getInputArray(input: string): string[] | undefined {
  return input ? input.split('\n').map(item => item.trim()) : undefined;
}

function validateAssignments(): void {
  validateAssignmentLikePatterns(INPUT_ASSIGNMENTS_KEY, assignments);
}

function validateEnforcementMode(): void {
  validateAssignmentLikePatterns(INPUT_ENFORCEMENT_MODE_KEY, enforcementMode);
}

export function validateAssignmentLikePatterns(inputName: string, patterns?: string[]): void {
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

function hasSlashInPattern(patterns: string[]): boolean {
  return patterns.some(pattern => {
    return pattern.includes('/');
  });
}

function hasGlobStarPattern(patterns: string[]): boolean {
  return patterns.some(pattern => {
    return pattern.includes('**');
  });
}