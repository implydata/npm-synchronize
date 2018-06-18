#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var chalk_1 = require("chalk");
var date = function () { return chalk_1.default.grey('[' + new Date().toLocaleTimeString() + ']'); };
exports.debug = function (wut) { return console.log(date() + ' ' + chalk_1.default.grey(wut)); };
exports.success = function (wut) { return console.log(date() + ' ' + chalk_1.default.green(wut)); };
exports.info = function (wut) { return console.log(date() + ' ' + chalk_1.default.blue(wut)); };
exports.warn = function (wut) { return console.warn(date() + ' ' + chalk_1.default.red(wut)); };
exports.log = function (wut) { return console.log(wut); };
exports.indent = function (lines, indentLevel) {
    if (indentLevel === void 0) { indentLevel = 2; }
    var spaces = '';
    for (var i = 0; i < indentLevel; i++)
        spaces += ' ';
    return lines.map(function (l) { return spaces + l; });
};
