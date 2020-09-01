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
exports.repeatString = exports.groupBy = exports.splitArray = exports.setUpUserAgent = exports.getWorkflowRunUrl = exports.prettyDebugLog = exports.prettyLog = void 0;
const core = __importStar(require("@actions/core"));
const crypto = __importStar(require("crypto"));
const TEXT_PARTITION = "----------------------------------------------------------------------------------------------------";
function prettyLog(text) {
    console.log(`${TEXT_PARTITION}\n${text}\n${TEXT_PARTITION}`);
}
exports.prettyLog = prettyLog;
function prettyDebugLog(text) {
    core.debug(`${TEXT_PARTITION}\n${text}\n${TEXT_PARTITION}`);
}
exports.prettyDebugLog = prettyDebugLog;
function getWorkflowRunUrl() {
    return `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}
exports.getWorkflowRunUrl = getWorkflowRunUrl;
function setUpUserAgent() {
    let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
    let actionName = 'ManageAzurePolicy';
    let userAgentString = `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
    core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
}
exports.setUpUserAgent = setUpUserAgent;
function splitArray(array, chunkSize) {
    let results = [];
    while (array.length) {
        results.push(array.splice(0, chunkSize));
    }
    return results;
}
exports.splitArray = splitArray;
/**
 * Group objects of an array based on a property.
 *
 * @param array Array of objects
 * @param property property based on which objects need to be grouped
 */
function groupBy(array, property) {
    let hash = {};
    for (var i = 0; i < array.length; i++) {
        if (!hash[array[i][property]]) {
            hash[array[i][property]] = [];
        }
        hash[array[i][property]].push(array[i]);
    }
    return hash;
}
exports.groupBy = groupBy;
function repeatString(str, repeatCount) {
    return str.repeat(repeatCount);
}
exports.repeatString = repeatString;
