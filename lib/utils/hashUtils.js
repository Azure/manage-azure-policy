"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObjectHash = void 0;
const objectHash = require("object-hash");
function getObjectHash(obj) {
    return objectHash.sha1(obj);
}
exports.getObjectHash = getObjectHash;
