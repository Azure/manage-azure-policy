"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRowSeparator = exports.getTableConfig = exports.printSummary = void 0;
const table = require("table");
const utilities_1 = require("../utils/utilities");
const policyHelper_1 = require("../azure/policyHelper");
const TITLE_PATH = 'PATH';
const TITLE_TYPE = 'TYPE';
const TITLE_OPERATION = 'OPERATION';
const TITLE_NAME = 'NAME';
const TITLE_STATUS = 'STATUS';
const TITLE_MESSAGE = 'MESSAGE';
function printSummary(policyResults) {
    let successRows = [];
    let errorRows = [];
    let titles = [TITLE_NAME, TITLE_TYPE, TITLE_PATH, TITLE_OPERATION, TITLE_STATUS, TITLE_MESSAGE];
    const widths = [30, 10, 25, 10, 10, 50];
    successRows.push(titles);
    errorRows.push(titles);
    const rowSeparator = getRowSeparator(widths);
    // Group result based on policy definition id.
    const groupedResult = utilities_1.groupBy(policyResults, 'policyDefinitionId');
    populateRows(groupedResult, successRows, errorRows, rowSeparator);
    if (successRows.length > 1) {
        console.log(table.table(successRows, getTableConfig(widths)));
    }
    if (errorRows.length > 1) {
        console.log(table.table(errorRows, getTableConfig(widths)));
    }
}
exports.printSummary = printSummary;
function populateRows(groupedResult, successRows, errorRows, rowSeparator) {
    for (const policyDefinitionId in groupedResult) {
        let successRowAdded = false;
        let errorRowAdded = false;
        const policyDefinitionResults = groupedResult[policyDefinitionId];
        policyDefinitionResults.forEach((policyResult) => {
            let row = [];
            row.push(policyResult.displayName);
            row.push(policyResult.type);
            row.push(policyResult.path);
            row.push(policyResult.operation);
            row.push(policyResult.status);
            row.push(policyResult.message);
            if (policyResult.status == policyHelper_1.POLICY_RESULT_SUCCEEDED) {
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
function getTableConfig(widths) {
    let config = {
        columns: {}
    };
    let index = 0;
    for (const width of widths) {
        config.columns[index] = {
            width: width,
            wrapWord: true
        };
        index++;
    }
    return config;
}
exports.getTableConfig = getTableConfig;
function getRowSeparator(widths) {
    let row = [];
    for (const width of widths) {
        row.push(utilities_1.repeatString('-', width));
    }
    return row;
}
exports.getRowSeparator = getRowSeparator;
