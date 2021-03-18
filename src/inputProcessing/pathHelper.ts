import * as glob from 'glob';
import minimatch from 'minimatch';
import * as path from 'path';
import * as core from '@actions/core';
import * as Inputs from './inputs';
import { POLICY_FILE_NAME, POLICY_INITIATIVE_FILE_NAME } from '../azure/policyHelper';
import { prettyDebugLog } from '../utils/utilities';

/**
  * @returns All the directories that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match any pattern given in ignore-paths input.
  *          3) Contain policy.json files.
  */
export function getAllPolicyDefinitionPaths(): string[] {
  core.debug('Looking for policy definition paths to include...');
  const policyPathsToInclude = getPolicyPathsMatchingPatterns(Inputs.includePathPatterns, POLICY_FILE_NAME);
  core.debug('Looking for policy definition paths to ignore...');
  const policyPathsToExclude = getPolicyPathsMatchingPatterns(Inputs.excludePathPatterns, POLICY_FILE_NAME);
  const policyPaths = policyPathsToInclude.filter(p => !policyPathsToExclude.includes(p));
  const debugMessage = policyPaths.length > 0
    ? `Found the following policy paths that match the given path filters:\n\n${policyPaths.join('\n')}`
    : `Found no policies that match the given path filters.`;
  prettyDebugLog(debugMessage);
  return policyPaths;
}

/**
  * @returns All the directories that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match any pattern given in ignore-paths input.
  *          3) Contain policyset.json files.
  */
export function getAllInitiativesPaths(): string[] {
  core.debug('Looking for policy initiative paths to include...');
  const policyInitiativePathsToInclude = getPolicyPathsMatchingPatterns(Inputs.includePathPatterns, POLICY_INITIATIVE_FILE_NAME);
  core.debug('Looking for policy initiative paths to ignore...');
  const policyInitiativePathsToExclude = getPolicyPathsMatchingPatterns(Inputs.excludePathPatterns, POLICY_INITIATIVE_FILE_NAME);
  const policyInitiativePaths = policyInitiativePathsToInclude.filter(p => !policyInitiativePathsToExclude.includes(p));
  const debugMessage = policyInitiativePaths.length > 0
    ? `Found the following policy initiative paths that match the given path filters:\n\n${policyInitiativePaths.join('\n')}`
    : `Found no policy initiatives that match the given path filters.`;
  prettyDebugLog(debugMessage);
  return policyInitiativePaths;
}

/**
  * @returns All the files that:
  *          1) Match any pattern given in paths input.
  *          2) Do not match pattern given in ignore-paths input.
  *          3) Contain policy.json as a sibling.
  *          4) File name matches any pattern given in assignments input.
  */

export function getAllPolicyAssignmentPaths(): string[] {
  core.debug('Looking for policy assignment paths to include...');
  const assignmentPathsToInclude = getAssignmentPathsMatchingPatterns(Inputs.includePathPatterns, Inputs.assignmentPatterns);
  core.debug('Looking for policy assignment paths to ignore...');
  const assignmentPathsToExclude = getAssignmentPathsMatchingPatterns(Inputs.excludePathPatterns, Inputs.assignmentPatterns);
  const assignmentPaths = assignmentPathsToInclude.filter(p => !assignmentPathsToExclude.includes(p));
  const debugMessage = assignmentPaths.length > 0
    ? `Found the following policy assignment paths that match the given path filters:\n\n${assignmentPaths.join('\n')}`
    : `Found no policy assignments that match the given path filters.`;
  prettyDebugLog(debugMessage);
  return assignmentPaths;
}

export function getAllAssignmentInPaths(definitionFolderPaths: string[]): string[] {
  return getAssignmentPathsMatchingPatterns(definitionFolderPaths, Inputs.assignmentPatterns);
}

export function isEnforced(assignmentPath: string): boolean {
  core.debug(`Checking if assignment path '${assignmentPath}' is set to enforce`);
  return Inputs.enforcePatterns.some(pattern => {
    const isMatch = minimatch(assignmentPath, pattern, { dot: true, matchBase: true });
    if (isMatch) {
      core.debug(`Assignment path '${assignmentPath}' matches pattern '${pattern}' for enforce`);
    }
    return isMatch;
  });
}

export function isNonEnforced(assignmentPath: string): boolean {
  core.debug(`Checking if assignment path '${assignmentPath}' is set to do not enforce`);
  return Inputs.doNotEnforcePatterns.some(pattern => {
    const isMatch = minimatch(assignmentPath, pattern, { dot: true, matchBase: true });
    if (isMatch) {
      core.debug(`Assignment path '${assignmentPath}' matches pattern '~${pattern}' for do not enforce`);
    }
    return isMatch;
  });
}

function getPolicyPathsMatchingPatterns(patterns: string[], policyFileName: string): string[] {
  let matchingPolicyPaths: string[] = [];
  patterns.forEach(pattern => {
    const policyFilePattern = path.join(pattern, policyFileName);
    const policyFiles: string[] = getFilesMatchingPattern(policyFilePattern);
    core.debug(`Policy file pattern: ${policyFilePattern}\n Matching policy paths: ${policyFiles}`);
    matchingPolicyPaths.push(...policyFiles.map(policyFile => path.dirname(policyFile)));
  });

  return getUniquePaths(matchingPolicyPaths);
}

function getAssignmentPathsMatchingPatterns(patterns: string[], assignmentPatterns: string[]): string[] {
  let matchingAssignmentPaths: string[] = [];
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

function getFilesMatchingPattern(pattern: string): string[] {
  return glob.sync(pattern, { dot: true });
}

function getUniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}