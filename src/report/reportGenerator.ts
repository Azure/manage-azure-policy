import * as table from 'table';
import { PolicyResult } from '../azure/policyHelper';

const TITLE_PATH: string = 'PATH';
const TITLE_TYPE: string = 'TYPE';
const TITLE_OPERATION: string = 'OPERATION';
const TITLE_NAME: string = 'NAME';
const TITLE_STATUS: string = 'STATUS';
const TITLE_MESSAGE: string = 'MESSAGE';

export function printSummary(policyResults: PolicyResult[]) {
  let rows: any = [];
  let titles = [TITLE_NAME, TITLE_TYPE, TITLE_PATH, TITLE_OPERATION, TITLE_STATUS, TITLE_MESSAGE];
  rows.push(titles);

  policyResults.forEach((policyResult: PolicyResult) => {
    let row: string[] = [];
    row.push(policyResult.name);
    row.push(policyResult.type);
    row.push(policyResult.path);
    row.push(policyResult.operation);
    row.push(policyResult.status);
    row.push(policyResult.message);
    rows.push(row);
  });

  let widths = [ 30, 10, 25, 10, 10, 50 ];
  console.log(table.table(rows, getTableConfig(widths)));
}

function getTableConfig(widths: number[]): any {
  let config: any = {
    columns: {}
  };

  let index: number = 0;
  for (const width of widths) {
    config.columns[index] = {
      width: width,
      wrapWord: true
    }

    index++;
  }

  return config;
}