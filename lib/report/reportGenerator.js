"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printSummary = void 0;
const table = __importStar(require("table"));
const TITLE_PATH = 'PATH';
const TITLE_TYPE = 'TYPE';
const TITLE_OPERATION = 'OPERATION';
const TITLE_NAME = 'NAME';
const TITLE_STATUS = 'STATUS';
const TITLE_MESSAGE = 'MESSAGE';
function printSummary(policyResults) {
    let rows = [];
    let titles = [TITLE_NAME, TITLE_TYPE, TITLE_PATH, TITLE_OPERATION, TITLE_STATUS, TITLE_MESSAGE];
    rows.push(titles);
    policyResults.forEach((policyResult) => {
        let row = [];
        row.push(policyResult.name);
        row.push(policyResult.type);
        row.push(policyResult.path);
        row.push(policyResult.operation);
        row.push(policyResult.status);
        row.push(policyResult.message);
        rows.push(row);
    });
    let widths = [30, 10, 25, 10, 10, 50];
    console.log(table.table(rows, getTableConfig(widths)));
}
exports.printSummary = printSummary;
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
