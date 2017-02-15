#!/usr/bin/env node
"use strict";
var chalk = require("chalk");
var date = function () { return chalk.grey('[' + new Date().toLocaleTimeString() + ']'); };
exports.debug = function (wut) { return console.log(date() + ' ' + chalk.grey(wut)); };
exports.success = function (wut) { return console.log(date() + ' ' + chalk.green(wut)); };
exports.info = function (wut) { return console.log(date() + ' ' + chalk.blue(wut)); };
exports.warn = function (wut) { return console.warn(date() + ' ' + chalk.red(wut)); };
exports.log = function (wut) { return console.log(wut); };
exports.indent = function (lines, indentLevel) {
    if (indentLevel === void 0) { indentLevel = 2; }
    var spaces = '';
    for (var i = 0; i < indentLevel; i++)
        spaces += ' ';
    return lines.map(function (l) { return spaces + l; });
};
