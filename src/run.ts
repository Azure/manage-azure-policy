import * as core from '@actions/core';
import { AzHttpClient } from './azure/azHttpClient';
import { ASSIGNMENT_TYPE, DEFINITION_TYPE, POLICY_OPERATION_UPDATE, PolicyRequest, PolicyResult, createOrUpdatePolicyObjects, setResult } from './azure/policyHelper'
import { printSummary } from './report/reportGenerator';

async function run() {
  try {
    // Get this array after parsing the paths and ignore-paths inputs.
    // Populating using env vars for testing. 
    const policyRequests: PolicyRequest[] = [
      {
        path: process.env.DEFINITION_PATH || '',
        type: DEFINITION_TYPE,
        operation: POLICY_OPERATION_UPDATE
      },
      {
        path: process.env.ASSIGNMENT_PATH || '',
        type: ASSIGNMENT_TYPE,
        operation: POLICY_OPERATION_UPDATE
      }
    ];

    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();
    const policyResults: PolicyResult[] = await createOrUpdatePolicyObjects(azHttpClient, policyRequests);
    printSummary(policyResults);
    setResult(policyResults);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();