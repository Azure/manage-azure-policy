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
exports.getAllJsonFilesPath = exports.getFileJson = exports.doesFileExist = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
function getAllJsonFilesPath(dirs) {
    let result = [];
    dirs.forEach((dir) => {
        let files = fs.readdirSync(dir);
        files.forEach((file) => {
            file = path.resolve(dir, file);
            if (fs.statSync(file).isDirectory()) {
                let additionalFiles = getAllJsonFilesPath([file]);
                result.push(...additionalFiles);
            }
            else if (path.extname(file) == '.json') {
                result.push(file);
            }
        });
    });
    // Return unique file paths
    return [...new Set(result)];
}
exports.getAllJsonFilesPath = getAllJsonFilesPath;
