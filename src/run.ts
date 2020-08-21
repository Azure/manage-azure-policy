import * as core from '@actions/core';
import * as Inputs from './inputProcessing/inputs';
import { POLICY_RESULT_FAILED, PolicyRequest, PolicyResult, createUpdatePolicies, getAllPolicyRequests } from './azure/policyHelper'
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
    Inputs.readInputs();
    const policyRequests: PolicyRequest[] = await getAllPolicyRequests();

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