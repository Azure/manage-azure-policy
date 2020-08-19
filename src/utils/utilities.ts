import * as core from "@actions/core";

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