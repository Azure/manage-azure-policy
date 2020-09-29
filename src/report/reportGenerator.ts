import * as table from 'table';
import { groupBy, repeatString } from '../utils/utilities';
import { PolicyResult, POLICY_RESULT_SUCCEEDED } from '../azure/policyHelper';

const TITLE_PATH: string = 'PATH';
const TITLE_TYPE: string = 'TYPE';
const TITLE_OPERATION: string = 'OPERATION';
const TITLE_NAME: string = 'NAME';
const TITLE_STATUS: string = 'STATUS';
const TITLE_MESSAGE: string = 'MESSAGE';

export function printSummary(policyResults: PolicyResult[]) {
  let successRows: any[] = [];
  let errorRows: any[] = [];

  let titles = [TITLE_NAME, TITLE_TYPE, TITLE_PATH, TITLE_OPERATION, TITLE_STATUS, TITLE_MESSAGE];
  const widths = [ 25, 10, 25, 10, 10, 45 ];
  successRows.push(titles);
  errorRows.push(titles);
  const rowSeparator = getRowSeparator(widths);

  // Group result based on policy definition id.
  const groupedResult = groupBy(policyResults, 'policyDefinitionId');
  populateRows(groupedResult, successRows, errorRows, rowSeparator);

  if (successRows.length > 1) {
    console.log(table.table(successRows, getTableConfig(widths)));
  }
  if (errorRows.length > 1) {
    console.log(table.table(errorRows, getTableConfig(widths)));
  }
}

function populateRows(groupedResult: any, successRows: any[], errorRows: any[], rowSeparator: string[]) {
  for (const policyDefinitionId in groupedResult) {
    let successRowAdded: boolean = false;
    let errorRowAdded: boolean = false;

    const policyDefinitionResults: PolicyResult[]  = groupedResult[policyDefinitionId];
    policyDefinitionResults.forEach((policyResult: PolicyResult) => {
      let row: string[] = [];
      row.push(policyResult.displayName);
      row.push(policyResult.type);
      row.push(policyResult.path);
      row.push(policyResult.operation);
      row.push(policyResult.status);
      row.push(policyResult.message);

      if (policyResult.status == POLICY_RESULT_SUCCEEDED) {
        successRows.push(row);
        successRowAdded = true;
      }
      else {
        errorRows.push(row);
        errorRowAdded = true;
      }
    });

    if (successRowAdded) {
      successRows.push(rowSeparator);
    }
    if (errorRowAdded) {
      errorRows.push(rowSeparator);
    }   
  }
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

function getRowSeparator(widths: number[]): string[] {
  let row: string[] = [];

  for (const width of widths) {
    row.push(repeatString('-', width));
  }

  return row;
}