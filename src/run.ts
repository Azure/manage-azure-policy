import * as core from '@actions/core';
import { ASSIGNMENT_TYPE, DEFINITION_TYPE, POLICY_OPERATION_UPDATE, POLICY_RESULT_FAILED, PolicyRequest, PolicyResult, createUpdatePolicies } from './azure/policyHelper'
import { printSummary } from './report/reportGenerator';

function setResult(policyResults: PolicyResult[]): void {
  const failedCount: number = policyResults.filter(result => result.status === POLICY_RESULT_FAILED).length;
  if (failedCount > 0) {
    core.setFailed(`Found '${failedCount}' failure(s) while deploying policies.`);
  } else {
    core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
  }
}

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

    const policyResults: PolicyResult[] = await createUpdatePolicies(policyRequests);
    printSummary(policyResults);
    setResult(policyResults);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();