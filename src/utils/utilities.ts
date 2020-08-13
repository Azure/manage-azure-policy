import * as core from "@actions/core";

export function printPartitionedText(text) {
  const textPartition: string =
    "----------------------------------------------------------------------------------------------------";
  console.log(`${textPartition}\n${text}\n${textPartition}`);
}

export function printPartitionedDebugLog(text) {
  const textPartition: string =
    "----------------------------------------------------------------------------------------------------";
  core.debug(`${textPartition}\n${text}\n${textPartition}`);
}

export function getWorkflowRunUrl(): string {
  return `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}