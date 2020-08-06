import * as path from 'path';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson } from '../utils/fileHelper';

export const DEFINITION_TYPE = "definition";
export const ASSIGNMENT_TYPE = "assignment";
const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";

export interface PolicyRequest {
  path: string;
  type: string;
}

export interface PolicyResult {
  path: string;
  type: string;
  status: string;
  message?: string;
}

export async function createOrUpdatePolicyObjects(azHttpClient: AzHttpClient, policyRequests: PolicyRequest[]): Promise<void> {
  let policyResults: PolicyResult[] = [];
  for (const policyRequest of policyRequests) {
    let policyResult: PolicyResult = { path: policyRequest.path, type: policyRequest.type, status: '' };

    switch (policyRequest.type) {
      case DEFINITION_TYPE:
        try {
          const definition: any = getPolicyDefinition(policyRequest.path);
          validateDefinition(definition);
          await azHttpClient.createOrUpdatePolicyDefinition(definition);
          policyResult.status = POLICY_RESULT_SUCCEEDED;
        }
        catch(error) {
          policyResult.status = POLICY_RESULT_FAILED;
          policyResult.message = `An error occured while creating/updating policy defition. Path: ${policyRequest.path} . Error: ${error}`;
        }

        policyResults.push(policyResult);
        break;

      case ASSIGNMENT_TYPE:
        try {
          const assignment: any = getPolicyAssignment(policyRequest.path);
          validateAssignment(assignment);
          await azHttpClient.createOrUpdatePolicyAssignment(assignment);
          policyResult.status = POLICY_RESULT_SUCCEEDED;
        }
        catch (error) {
          policyResult.status = POLICY_RESULT_FAILED;
          policyResult.message = `An error occured while creating/updating policy assignment. Path: ${policyRequest.path} . Error: ${error}`;
        }

        policyResults.push(policyResult);
        break;
    }
  }
}

function getPolicyDefinition(definitionPath: string): any {
  const policyPath = path.join(definitionPath, POLICY_FILE_NAME);
  const policyRulesPath = path.join(definitionPath, POLICY_RULES_FILE_NAME);
  const policyParametersPath = path.join(definitionPath, POLICY_PARAMETERS_FILE_NAME);

  let definition = getFileJson(policyPath);

  if (!definition.policyRule && doesFileExist(policyRulesPath)) {
    const policyRule = getFileJson(policyRulesPath);
    definition.policyRule = policyRule;
  }

  if (!definition.parameters && doesFileExist(policyParametersPath)) {
    const policyParameters = getFileJson(policyParametersPath);
    definition.parameters = policyParameters;
  }

  return definition;
}

function getPolicyAssignment(assignmentPath: string): any {
  return getFileJson(assignmentPath);
}

function validateDefinition(definition: any): void {
  if (!definition.id) {
    throw Error('Property id is missing from the policy definition. Please add id to the policy.json file.');
  }

  if (!definition.name) {
    throw Error('Property name is missing from the policy definition. Please add name to the policy.json file.');
  }
}

function validateAssignment(assignment: any): void {
  if (!assignment.id) {
    throw Error('Property id is missing from the policy assignment. Please add id to the assignment file.');
  }

  if (!assignment.name) {
    throw Error('Property name is missing from the policy assignment. Please add name to the assignment file.');
  }
}