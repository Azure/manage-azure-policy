import * as path from 'path';
import * as core from '@actions/core';
import { AzHttpClient } from './azHttpClient';
import { doesFileExist, getFileJson } from '../utils/fileHelper';

export const DEFINITION_TYPE = "definition";
export const ASSIGNMENT_TYPE = "assignment";
export const POLICY_OPERATION_CREATE = "CREATE";
export const POLICY_OPERATION_UPDATE = "UPDATE";
export const POLICY_RESULT_FAILED = "FAILED";
const POLICY_RESULT_SUCCEEDED = "SUCCEEDED";
const POLICY_FILE_NAME = "policy.json";
const POLICY_RULES_FILE_NAME = "policy.rules.json";
const POLICY_PARAMETERS_FILE_NAME = "policy.parameters.json";

export interface PolicyRequest {
  path: string;
  type: string;
  operation: string;
}

export interface PolicyResult {
  path: string;
  type: string;
  operation: string;
  name: string;
  status: string;
  message: string;
}

export async function createUpdatePolicies(policyRequests: PolicyRequest[]): Promise<PolicyResult[]> {
  const azHttpClient = new AzHttpClient();
  await azHttpClient.initialize();
  
  let policyResults: PolicyResult[] = [];
  for (const policyRequest of policyRequests) {
    switch (policyRequest.type) {
      case DEFINITION_TYPE:
        policyResults.push(await upsertPolicyDefinition(azHttpClient, policyRequest));
        break;

      case ASSIGNMENT_TYPE:
        policyResults.push(await upsertPolicyAssignment(azHttpClient, policyRequest));
        break;
    }
  }

  return Promise.resolve(policyResults);
}

function getPolicyDefinition(definitionPath: string): any {
  const policyPath = path.join(definitionPath, POLICY_FILE_NAME);
  const policyRulesPath = path.join(definitionPath, POLICY_RULES_FILE_NAME);
  const policyParametersPath = path.join(definitionPath, POLICY_PARAMETERS_FILE_NAME);

  let definition = getFileJson(policyPath);

  if ((!definition.properties || !definition.properties.policyRule) && doesFileExist(policyRulesPath)) {
    const policyRuleJson = getFileJson(policyRulesPath);
    if (policyRuleJson && policyRuleJson.policyRule) {
      if (!definition.properties) {
        // If properties is missing from the definition object and we obtain policyRule from the
        // policy rules file, add properties.
        definition.properties = {};
      }

      definition.properties.policyRule = policyRuleJson.policyRule;
    }
  }

  if ((!definition.properties || !definition.properties.parameters) && doesFileExist(policyParametersPath)) {
    const policyParametersJson = getFileJson(policyParametersPath);
    if (policyParametersJson && policyParametersJson.parameters) {
      if (!definition.properties) {
        // If properties is missing from the definition object and we obtain parameters from the
        // policy parameters file, add properties.
        definition.properties = {};
      }

      definition.properties.parameters = policyParametersJson.parameters;
    }
  }

  return definition;
}

function getPolicyAssignment(assignmentPath: string): any {
  return getFileJson(assignmentPath);
}

async function upsertPolicyDefinition(azHttpClient: AzHttpClient, policyRequest: PolicyRequest): Promise<PolicyResult> {
  let policyResult: PolicyResult = {
    path: policyRequest.path,
    type: policyRequest.type,
    operation: policyRequest.operation,
    name: '',
    status: '',
    message: ''
  };

  const isCreate: boolean = isCreateOperation(policyRequest);

  try {
    const definition: any = getPolicyDefinition(policyRequest.path);
    validateDefinition(definition);
    policyResult.name = definition.name;
    await azHttpClient.createOrUpdatePolicyDefinition(definition);
    policyResult.status = POLICY_RESULT_SUCCEEDED;
    policyResult.message = `Policy definition ${isCreate ? 'created' : 'updated'} successfully`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }
  catch (error) {
    policyResult.status = POLICY_RESULT_FAILED;
    policyResult.message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy defition. Error: ${error}`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }

  return policyResult;
}

async function upsertPolicyAssignment(azHttpClient: AzHttpClient, policyRequest: PolicyRequest): Promise<PolicyResult> {
  let policyResult: PolicyResult = {
    path: policyRequest.path,
    type: policyRequest.type,
    operation: policyRequest.operation,
    name: '',
    status: '',
    message: ''
  };

  const isCreate: boolean = isCreateOperation(policyRequest);

  try {
    const assignment: any = getPolicyAssignment(policyRequest.path);
    validateAssignment(assignment);
    policyResult.name = assignment.name;
    await azHttpClient.createOrUpdatePolicyAssignment(assignment);
    policyResult.status = POLICY_RESULT_SUCCEEDED;
    policyResult.message = `Policy assignment ${isCreate ? 'created' : 'updated'} successfully`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }
  catch (error) {
    policyResult.status = POLICY_RESULT_FAILED;
    policyResult.message = `An error occured while ${isCreate ? 'creating' : 'updating'} policy assignment. Error: ${error}`;
    console.log(`${policyResult.message}. Path: ${policyRequest.path}`);
  }

  return policyResult;
}

function isCreateOperation(policyRequest: PolicyRequest): boolean {
  return policyRequest.operation == POLICY_OPERATION_CREATE;
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