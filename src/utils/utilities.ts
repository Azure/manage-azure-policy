import * as core from "@actions/core";
import * as crypto from "crypto";

const TEXT_PARTITION: string = "----------------------------------------------------------------------------------------------------";

export function prettyLog(text: string) {
  console.log(`${TEXT_PARTITION}\n${text}\n${TEXT_PARTITION}`);
}

export function prettyDebugLog(text: string) {
  core.debug(`${TEXT_PARTITION}\n${text}\n${TEXT_PARTITION}`);
}

export function getWorkflowRunUrl(): string {
  return `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}

export function setUpUserAgent() {
  let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
  let actionName = 'ManageAzurePolicy';
  let userAgentString = `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
  core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
}

export function splitArray(array: any[], chunkSize: number): any[] {
  let results = [];

  while (array.length) {
    results.push(array.splice(0, chunkSize));
  }

  return results;
}

/**
 * Group objects of an array based on a property.
 * 
 * @param array Array of objects
 * @param property property based on which objects need to be grouped
 */
export function groupBy(array: any[], property: string): any {
  let hash = {};
  for (var i = 0; i < array.length; i++) {
      if (!hash[array[i][property]]) {
        hash[array[i][property]] = [];
      }
      hash[array[i][property]].push(array[i]);
  }
  return hash;
}

export function repeatString(str: string, repeatCount: number): string {
  return str.repeat(repeatCount);
}