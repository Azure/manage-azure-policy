import * as core from '@actions/core';
import * as Inputs from './inputProcessing/inputs';
import { POLICY_RESULT_FAILED, PolicyRequest, PolicyResult, createUpdatePolicies, getAllPolicyRequests } from './azure/policyHelper'
import { printSummary } from './report/reportGenerator';
import { prettyDebugLog, setUpUserAgent } from './utils/utilities'

/**
 * Entry point for Action
 */
async function run() {
  let policyResults: PolicyResult[] = null;
  try {
    Inputs.readInputs();
    setUpUserAgent();
    
    const policyRequests: PolicyRequest[] = await getAllPolicyRequests();

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
  if (!policyResults) {
    core.setFailed(`Error while deploying policies.`);
  } else {
    const failedCount: number = policyResults.filter(result => result.status === POLICY_RESULT_FAILED).length;
    if (failedCount > 0) {
      core.setFailed(`Found '${failedCount}' failure(s) while deploying policies.`);
    } else {
      core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
    }
  }

}

run();