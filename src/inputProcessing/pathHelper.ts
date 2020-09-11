import * as glob from 'glob';
import minimatch from 'minimatch';
import * as path from 'path';
import * as Inputs from './inputs';
import { POLICY_FILE_NAME } from '../azure/policyHelper';

/**
  * @returns All the directories that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match any pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policy.json files.
  */
export function getAllPolicyDefinitionPaths(): string[] {
  const policyPathsToInclude = getPolicyPathsMatchingPatterns(Inputs.includePathPatterns);
  const policyPathsToExclude = getPolicyPathsMatchingPatterns(Inputs.excludePathPatterns);
  return policyPathsToInclude.filter(p => !policyPathsToExclude.includes(p));
}

/**
  * @returns All the files that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match pattern given in ignore-paths input or pattern starting with '!' in path input.
  *          3) Contain policy.json as a sibling.
  *          4) File name matches any pattern given in assignments input.
  */
export function getAllPolicyAssignmentPaths(): string[] {
  const assignmentPathsToInclude = getAssignmentPathsMatchingPatterns(Inputs.includePathPatterns, Inputs.includeAssignmentPatterns);
  const assignmentPathsToExclude = getAssignmentPathsMatchingPatterns(Inputs.excludePathPatterns, Inputs.excludeAssignmentPatterns);
  return assignmentPathsToInclude.filter(a => !assignmentPathsToExclude.includes(a));
}

export function isEnforced(assignmentPath: string): boolean {
  return Inputs.enforcePatterns.some(pattern => {
    return minimatch(assignmentPath, pattern, { matchBase: true });
  });
}

export function isNonEnforced(assignmentPath: string): boolean {
  return Inputs.doNotEnforcePatterns.some(pattern => {
    return minimatch(assignmentPath, pattern, { matchBase: true });
  });
}

function getPolicyPathsMatchingPatterns(patterns: string[]): string[] {
  let matchingPolicyPaths: string[] = [];
  patterns.forEach(pattern => {
    const policyFilePattern = path.join(pattern, POLICY_FILE_NAME);
    const policyFiles: string[] = getFilesMatchingPattern(policyFilePattern);
    matchingPolicyPaths.push(...policyFiles.map(policyFile => path.dirname(policyFile)));
  });

  return getUniquePaths(matchingPolicyPaths);
}

function getAssignmentPathsMatchingPatterns(patterns: string[], assignmentPatterns: string[]): string[] {
  let matchingAssignmentPaths: string[] = [];
  patterns.forEach(policyPath => {
    assignmentPatterns.forEach(assignmentPattern => {
      const assignmentPaths = getFilesMatchingPattern(path.join(policyPath, assignmentPattern));
      matchingAssignmentPaths.push(...assignmentPaths);
    });
  });

  return getUniquePaths(matchingAssignmentPaths);
}

function getFilesMatchingPattern(pattern: string): string[] {
  return glob.sync(pattern);
}

function getUniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}