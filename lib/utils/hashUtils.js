"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObjectHash = void 0;
const object_hash_1 = __importDefault(require("object-hash"));
function getObjectHash(obj) {
    return object_hash_1.default.sha1(obj);
}
exports.getObjectHash = getObjectHash;
