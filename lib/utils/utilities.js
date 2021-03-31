"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomShortString = exports.populatePropertyFromJsonFile = exports.repeatString = exports.groupBy = exports.splitArray = exports.setUpUserAgent = exports.getWorkflowRunUrl = exports.prettyDebugLog = exports.prettyLog = void 0;
const core = require("@actions/core");
const crypto = require("crypto");
const fileHelper_1 = require("./fileHelper");
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
/**
 * Populates property to the given object from the provided jsonfile. If jsonfile does not contain the property whole json object is populated.
 *
 * @param object object to which property needs to be populated
 * @param jsonFilePath File from which property is to be read
 * @param propertyName Name of property which needs to be populated
 */
function populatePropertyFromJsonFile(object, jsonFilePath, propertyName) {
    if (fileHelper_1.doesFileExist(jsonFilePath)) {
        const jsonObj = fileHelper_1.getFileJson(jsonFilePath);
        if (jsonObj) {
            // If same property exists in jsonObj then fetch that else use whole json object
            if (jsonObj[propertyName]) {
                object[propertyName] = jsonObj[propertyName];
            }
            else {
                object[propertyName] = jsonObj;
            }
        }
    }
}
exports.populatePropertyFromJsonFile = populatePropertyFromJsonFile;
/**
 * Returns a short random string of 11 characters
 *
 * */
function getRandomShortString() {
    return Math.random().toString(36).slice(-11);
}
exports.getRandomShortString = getRandomShortString;
