#!/usr/bin/env node

import chalk from 'chalk';


const date = () => chalk.grey('[' + new Date().toLocaleTimeString() + ']');

export const debug = (wut: string) => console.log(date() + ' ' + chalk.grey(wut));
export const success = (wut: string) => console.log(date() + ' ' + chalk.green(wut));
export const info = (wut: string) => console.log(date() + ' ' + chalk.blue(wut));
export const warn = (wut: string) => console.warn(date() + ' ' + chalk.red(wut));
export const log = (wut: string) => console.log(wut);
export const indent = function(lines: string[], indentLevel=2) {
  var spaces = '';
  for (var i = 0; i < indentLevel; i++) spaces += ' ';

  return lines.map(l => spaces + l);
};
