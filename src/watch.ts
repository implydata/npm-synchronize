#!/usr/bin/env node

import * as pathUtils from 'path';
import * as chokidar from 'chokidar';
import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as Q from 'q';
import * as fs from 'fs';
import * as yargs from 'yargs';
import { Fn } from '@implydata/beltful';
import { debug, success, info, warn, log, indent } from './logger';
import * as updateNotifier from 'update-notifier';

const pkg = require(path.resolve(__dirname, '../package.json'));
updateNotifier({pkg}).notify();

// Untyped stuff
let tar = require('tar-fs');
let gunzip = require('gunzip-maybe');
let debounce = require('lodash.debounce');
let yesno = require('yesno');


interface Link {
  target: string,
  postUpdate?: string;
}

interface SloppyConfig {
  links: Record<string, (Link | string)[]>;
}

interface Config {
  links: Record<string, Link[]>;
}

interface PackageJSON {
  files: string[];
  name: string;
}

const argv = yargs
  .usage([
    'Usage: $0 -i [PATH] -o [PATH]',
    '       $0 -c [PATH]',
    '       $0 -c -i [PATH] -o [PATH]'
  ].join('\n'))
  .example('$0 -i ../caladan -o ../im-pivot', 'Updates im-pivot each time caladan is built')

  .alias('i', 'input')
  .describe('i', 'Input directory (must be a NPM package)')

  .alias('o', 'output')
  .describe('o', 'Output directory (must be a NPM package)')

  .alias('u', 'post-update')
  .describe('u', 'Post update hook')

  .alias('c', 'config')
  .describe('c', 'a JSON config file (if used with other arguments, will just output the generated config on stdin)')

  .boolean('verbose')
  .alias('v', 'verbose')
  .describe('v', 'Verbose')

  .boolean('once')
  .describe('once', 'Once')

  .help('h')
  .alias('h', 'help')

  .argv;


// Subroutines

const areArgsConsistent = (input: string | string[], output: string | string[]) => {
  if (!input || !output) return false;

  if (typeof input === 'string' && typeof output === 'string') return true;

  if (typeof input !== typeof output) return false;

  if (input.length !== output.length) return false;

  return true;
};

const loadJSON = (path: string): any => {
  try {
    return require(path);
  } catch (e) {
    throw new Error('Unable to read ' + path);
  }
}

const prepareTarBall = (source: string): Q.Promise<string> => {
  if (!source) throw new Error('must have source');

  const deferred = Q.defer<string>();

  exec('npm pack', {cwd: source}, (error, stdout, stderr) => {
    if (error) throw error;

    const stdoutLines = String(stdout).split(/[\r\n]+/g);

    // Remove last line if blank
    if (stdoutLines[stdoutLines.length - 1] === '') stdoutLines.pop();

    const tarballName = stdoutLines[stdoutLines.length - 1];
    if (tarballName.indexOf('.tgz') === -1) throw new Error(`can not detect tarball name in stdout ${stdout}`);

    var tarBallPath = pathUtils.resolve(source, tarballName);
    deferred.resolve(tarBallPath);
  });

  return deferred.promise;
};


const extractTarBall = (target: string, dependencyName: string, tarBallPath: string): Q.Promise<string> => {
  const deferred = Q.defer<string>();

  fs.createReadStream(tarBallPath)
    .pipe(gunzip())
    .pipe(tar.extract(pathUtils.resolve(target, 'node_modules', dependencyName), {
      map: (header: {name: string}) => {
        header.name = header.name.replace(/^package\//, '');
        return header;
      }
    }))
    .on('error', (e: Error) => deferred.reject(e))
    .on('finish', () => deferred.resolve(tarBallPath))
  ;

  return deferred.promise;
};

const extractTarBalls = (targets: Link[], dependencyName: string, tarBallPath: string): Q.Promise<string[]> => {
  return Q.all(targets.map(({target}) => extractTarBall(target, dependencyName, tarBallPath)));
};

const removeTarBall = (tarBallPath: string): Q.Promise<void> => {
  const deferred = Q.defer<void>();
  fs.unlink(tarBallPath, () => deferred.resolve());
  return deferred.promise;
};

const removeTarBalls = (paths: string[]): Q.Promise<any[]> => {
  return Q.all(paths.map(removeTarBall));
}

const getFilesToWatch = (input: string, sourcePkg: PackageJSON): string[] => {
  if (!sourcePkg.files) {
    warn(`Watching entire directory (${input}) for ${sourcePkg.name}, this might be hazardous...`);
    return [pathUtils.resolve(input)];
  }

  return sourcePkg.files.map(f => pathUtils.resolve(input, f));
}

const addLink = function(links: Record<string, Link[]>, source: string, target: string, postUpdate: string) {
  let targets = links[source] || [];

  if (targets.filter(t => t.target === target).length === 0) targets.push({target, postUpdate});

  links[source] = targets;
};

const gatherLinks = function(input: string | string[], output: string | string[], postUpdate: string | string[]): Record<string, Link[]> {
  if (typeof input === 'string') input = [input];
  if (typeof output === 'string') output = [output];
  if (typeof postUpdate === 'string') postUpdate = [postUpdate];

  postUpdate = postUpdate || [];

  let links: Record<string, Link[]> = {};

  input.forEach((source, i) => {
    addLink(links, source, output[i], postUpdate[i]);
  });

  return links;
};

const watch = function(source: string, targets: Link[]): Q.Promise<{close: Fn, waitForUpdate: Fn}> {
  var deferred = Q.defer<{close: Fn, waitForUpdate: Fn}>();
  var updateDeferred = Q.defer<string>();

  let sourcePkg = loadJSON(pathUtils.resolve(source, 'package.json')) as PackageJSON;

  let filesToWatch = getFilesToWatch(source, sourcePkg);
  let watcher = chokidar.watch(filesToWatch, {ignored: /[\/\\]\./});

  watcher.on('ready', () => {
    info('Ready, watching following files/patterns:\n' + indent(filesToWatch).join('\n'));

    deferred.resolve({
      close: watcher.close.bind(watcher),
      waitForUpdate: () => updateDeferred.promise
    });

    watcher.on('all', (event, path) => {
      if (argv.verbose) debug(`${path}\t[${event}]`);
      run(source, targets, sourcePkg, (msg: string) => {
        updateDeferred.resolve(msg);
        updateDeferred = Q.defer<string>();
      });
    })
  });

  return deferred.promise;
};

const startFromConfigPath = function(path: string) {
  let config: SloppyConfig = {links: loadJSON(pathUtils.resolve('.', path))};

  for (let source in config.links) {
    watch(source, config.links[source].map((o: Link | string) => {
      if (typeof o === 'string') return {target: o};

      return o;
    }));
  }
}

const tryToFindConfig = function() {
  const jsonRegExp = /.*\.json$/;

  fs.readdir('.', (err, files) => {
    let jsons = files.filter(jsonRegExp.exec.bind(jsonRegExp));

    if (jsons.length !== 1) {
      // No possible config found
      yargs.showHelp();
      process.exit(1);
    }

    yesno.ask(`Wanna use ${jsons[0]} as a config file ? [Y/n]`, true, (ok: boolean) => {
      if (ok) {
        startFromConfigPath(jsons[0]);
      } else {
        process.exit(0);
      }
    });
  });
};

const runHook = function(hook: string) {
  if (!hook) return;
  spawn(hook, [], { shell: true, stdio: 'inherit' });
};

const dumpConfig = function(links: Record<string, Link[]>) {
  let cleanLinks: Record<string, (Link | string)[]> = {};

  for (let source in links) {
    cleanLinks[source] = links[source].map(o => {
      if (o.postUpdate === undefined) return o.target;

      return o;
    });
  }

  log(JSON.stringify(cleanLinks));
};

// End of subroutines


// Stateful stuff
var isRunning = false;
var shouldReRun = false;
const run = debounce((source: string, targets: Link[], sourcePkg: PackageJSON, callback: (str: string) => void) => {
  if (isRunning) {
    shouldReRun = true;
    return;
  }

  isRunning = true;

  return prepareTarBall(source)
    .then((tarBallPath) => extractTarBalls(targets, sourcePkg.name, tarBallPath))
    .then(removeTarBalls)
    .then(() => {
      isRunning = false;

      if (shouldReRun) {
        info('Package updated during copy, running again...');
        shouldReRun = false;
        return run(source, targets, sourcePkg, callback);
      } else {
        let msg = targets.map(t => t.target) + ' updated with ' + source;

        targets.forEach(({postUpdate}) => runHook(postUpdate))

        success(msg);
        callback && callback(msg)
        return;
      }
    }).done();
}, 100);
// End of stateful stuff


if (require.main === module) { // CLI
  let links: Record<string, Link[]>;

  let hasConfig = argv.config;
  let hasInlineArgs = areArgsConsistent(argv.input, argv.output);

  if (hasInlineArgs) {
    links = gatherLinks(argv.input, argv.output, argv.postUpdate);

    if (hasConfig) {
      dumpConfig(links)
      process.exit(0);
    }

    if (argv.once) {
      for (let source in links) {
        run(source, links[source], loadJSON(pathUtils.resolve(source, 'package.json')));
      }
    } else {
      for (let source in links) {
        watch(source, links[source]);
      }
    }
  } else if (hasConfig) {
    startFromConfigPath(argv.config);
  } else {
    tryToFindConfig();
  }

} else { // When require'd from another script
  module.exports = watch;
}
