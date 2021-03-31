"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileJson = exports.doesFileExist = void 0;
const fs = require("fs");
function doesFileExist(path) {
    return fs.existsSync(path);
}
exports.doesFileExist = doesFileExist;
function getFileJson(path) {
    try {
        const rawContent = fs.readFileSync(path, 'utf-8');
        return JSON.parse(rawContent);
    }
    catch (ex) {
        throw new Error(`An error occured while parsing the contents of the file: ${path}. Error: ${ex}`);
    }
}
exports.getFileJson = getFileJson;
