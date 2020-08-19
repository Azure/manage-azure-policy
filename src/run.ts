import * as core from '@actions/core';
import { ASSIGNMENT_TYPE, DEFINITION_TYPE, POLICY_OPERATION_UPDATE, POLICY_RESULT_FAILED, PolicyRequest, PolicyResult, createUpdatePolicies } from './azure/policyHelper'
import { printSummary } from './report/reportGenerator';
import { prettyDebugLog } from './utils/utilities'

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
    const pathsInput = core.getInput("paths");
    if (!pathsInput) {
      core.setFailed("No path supplied.");
      return;
    }

    const paths = pathsInput.split('\n');

    const policyRequests: PolicyRequest[] = await getAllPolicyRequests(paths);

    // For test purpose
    policyRequests.forEach((policyReq) => {
      prettyDebugLog(`Path : ${policyReq.path}\nOperation : ${policyReq.operation}\nPolicy : ${JSON.stringify(policyReq.policy, null, 4)}`);
    });

    const policyResults: PolicyResult[] = await createUpdatePolicies(policyRequests);
    printSummary(policyResults);
    setResult(policyResults);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();