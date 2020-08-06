import * as core from '@actions/core';
import { AzHttpClient } from './azure/azHttpClient';
import { ASSIGNMENT_TYPE, createOrUpdatePolicyObjects, DEFINITION_TYPE, PolicyRequest } from './azure/policyHelper'

async function run() {
  try {
    // Get this array after parsing the paths and ignore-paths inputs.
    // Populating using env vars for testing. 
    const policyRequests: PolicyRequest[] = [
      {
        path: process.env.DEFINITION_PATH || '',
        type: DEFINITION_TYPE,
      },
      {
        path: process.env.ASSIGNMENT_PATH || '',
        type: ASSIGNMENT_TYPE,
      }
    ];

    const azHttpClient = new AzHttpClient();
    await azHttpClient.initialize();
    await createOrUpdatePolicyObjects(azHttpClient, policyRequests);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();