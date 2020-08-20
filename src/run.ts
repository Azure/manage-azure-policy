import * as core from '@actions/core';
import * as Inputs from './inputProcessing/inputs';
import { POLICY_RESULT_FAILED, PolicyRequest, PolicyResult, createUpdatePolicies, getAllPolicyRequests } from './azure/policyHelper'
import { printSummary } from './report/reportGenerator';
import { prettyDebugLog } from './utils/utilities'

/**
 * Entry point for Action
 */
async function run() {

  let policyResults: PolicyResult[] = null;
  try {

    //1. Fetch polices from GitHub repo that needs to Created or Updated
    const policyRequests: PolicyRequest[] = await getAllPolicyRequests();

    // TODO remove this, For test purpose
    policyRequests.forEach((policyReq) => {
      prettyDebugLog(`Path : ${policyReq.path}\nOperation : ${policyReq.operation}\nPolicy : ${JSON.stringify(policyReq.policy, null, 4)}`);
    });

    //2. Push above polices to Azure policy service
    policyResults = await createUpdatePolicies(policyRequests);

    //3. Print summary result to console
    printSummary(policyResults);

  } catch (error) {
    core.setFailed(error.message);
  } finally {
    //4. Set action outcome
    setResult(policyResults);
  }
}

function setResult(policyResults: PolicyResult[]): void {
  const failedCount: number = policyResults ? policyResults.filter(result => result.status === POLICY_RESULT_FAILED).length : 1;
  if (!policyResults || failedCount > 0) {
    core.setFailed(`Found '${failedCount}' failure(s) while deploying policies.`);
  } else {
    core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
  }
}

run();