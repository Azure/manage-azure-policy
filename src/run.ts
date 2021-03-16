import * as core from '@actions/core';
import * as Inputs from './inputProcessing/inputs';
import { POLICY_FILE_NAME, POLICY_INITIATIVE_FILE_NAME, POLICY_RESULT_FAILED, PolicyRequest, PolicyResult, createUpdatePolicies, getAllPolicyRequests } from './azure/policyHelper'
import { printSummary } from './report/reportGenerator';
import { prettyLog, setUpUserAgent } from './utils/utilities'

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
    prettyLog(`Error : ${error}`);
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
    } else if (policyResults.length > 0) {
      core.info(`All policies deployed successfully. Created/updated '${policyResults.length}' definitions/assignments.`);
    } else {
      let warningMessage: string;
      if(Inputs.mode == Inputs.MODE_COMPLETE) {
        warningMessage = `Did not find any policies to create/update. No policy files match the given patterns. If you have policy definitions or policy initiatives, please ensure that the files are named '${POLICY_FILE_NAME}' and '${POLICY_INITIATIVE_FILE_NAME}' respectively. For more details, please enable debug logs by adding secret 'ACTIONS_STEP_DEBUG' with value 'true'. (https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-step-debug-logging)`;
      }
      else {
        warningMessage = `Did not find any policies to create/update. No policy files match the given patterns or no changes were detected. If you have policy definitions or policy initiatives, please ensure that the files are named '${POLICY_FILE_NAME}' and '${POLICY_INITIATIVE_FILE_NAME}' respectively. For more details, please enable debug logs by adding secret 'ACTIONS_STEP_DEBUG' with value 'true'. (https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-step-debug-logging)`;
      }

      core.warning(warningMessage);
    }
  }
}

run();