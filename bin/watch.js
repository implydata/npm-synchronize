#!/usr/bin/env node

const pathUtils = require('path');
const chokidar = require('chokidar');
const exec = require('child_process').exec;
const Q = require('q');
const tar = require('tar-fs')
const gunzip = require('gunzip-maybe');
const fs = require('fs')
const debounce = require('lodash.debounce');
const yargs = require('yargs');
const chalk = require('chalk');

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

  .alias('c', 'config')
  .describe('c', 'a JSON config file (if used with other arguments, will just output the generated config on stdin)')

  .boolean('verbose')
  .alias('v', 'verbose')
  .describe('v', 'Verbose')

  .help('h')
  .alias('h', 'help')

  .argv;


// subroutines

const areArgsConsistent = (input, output) => {
  if (!input || !output) return false;

  if (typeof input === 'string' && typeof output === 'string') return true;

  if (typeof input !== typeof output) return false;

  if (input.length !== output.length) return false;

  return true;
};

const loadJSON = (path) => {
  try {
    return require(path);
  } catch (e) {
    throw new Error('Unable to read ' + path);
  }
}

const prepareTarBall = (source) => {
  if (!source) throw new Error('must have source');

  const deferred = Q.defer();
  exec('npm pack', {cwd: source}, (error, stdout, stderr) => {
    if (error) throw error;
    if (stderr) throw new Error(stderr);

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


const extractTarBall = (target, dependencyName, tarBallPath) => {
  const deferred = Q.defer();

  fs.createReadStream(tarBallPath)
    .pipe(gunzip())
    .pipe(tar.extract(pathUtils.resolve(target, 'node_modules', dependencyName), {
      map: (header) => {
        header.name = header.name.replace(/^package\//, '');
        return header;
      }
    }))
    .on('error', () => deferred.reject())
    .on('finish', () => deferred.resolve(tarBallPath))
  ;

  return deferred.promise;
};

const extractTarBalls = (targets, dependencyName, tarBallPath) => {
  return Q.all(targets.map(target => extractTarBall(target, dependencyName, tarBallPath)));
};

const removeTarBall = (tarBallPath) => {
  const deferred = Q.defer();
  fs.unlink(tarBallPath, () => deferred.resolve());
  return deferred.promise;
};

const removeTarBalls = (paths) => {
  return Q.all(paths.map(removeTarBall));
}

const getFilesToWatch = (input, sourcePkg) => {
  if (!sourcePkg.files) {
    warn(`Watching entire directory (${input}) for ${sourcePkg.name}, this might be hazardous...`);
    return [pathUtils.resolve(input)];
  }

  return sourcePkg.files.map(f => pathUtils.resolve(input, f));
}

const addLink = function(links, source, target) {
  let targets = links[source] || [];

  if (targets.indexOf(target) === -1) targets.push(target);

  links[source] = targets;
};

const gatherLinks = function(input, output) {
  if (typeof input === 'string') {
    input = [input];
    output = [output];
  }

  let links = {};

  input.forEach((source, i) => {
    addLink(links, source, output[i]);
  });

  return links;
};

const indent = function(lines, indentLevel=2) {
  var spaces = '';
  for (var i = 0; i < indentLevel; i++) spaces += ' ';

  return lines.map(l => spaces + l);
};

const watch = function(source, targets) {
  let sourcePkg = loadJSON(pathUtils.resolve(source, 'package.json'));

  let filesToWatch = getFilesToWatch(source, sourcePkg);
  let watcher = chokidar.watch(filesToWatch, {ignored: /[\/\\]\./});

  watcher.on('ready', () => {
    info('Watching following files/patterns:\n' + indent(filesToWatch).join('\n'));

    watcher.on('all', (event, path) => {
      if (argv.verbose) debug(`${path}\t[${event}]`);
      run(source, targets, sourcePkg);
    })
  });
};

const date = () => chalk.grey('[' + new Date().toLocaleTimeString() + ']');

const debug = (wut) => console.log(date() + ' ' + chalk.grey(wut));
const success = (wut) => console.log(date() + ' ' + chalk.green(wut));
const info = (wut) => console.log(date() + ' ' + chalk.blue(wut));
const warn = (wut) => console.warn(date() + ' ' + chalk.red(wut));
// end of subroutines


var isRunning = false;
var shouldReRun = false;
const run = debounce((source, targets, sourcePkg) => {
  if (isRunning) {
    shouldReRun = true;
    return;
  }

  isRunning = true;

  prepareTarBall(source)
    .then((tarBallPath) => extractTarBalls(targets, sourcePkg.name, tarBallPath))
    .then(removeTarBalls)
    .then(() => {
      isRunning = false;

      if (shouldReRun) {
        info('Package updated during copy, running again...');
        shouldReRun = false;
        run(source, targets, sourcePkg);
        return;
      } else {
        success(targets + ' updated with ' + source);
      }
    })
    .done();
}, 100);

var links;

var hasConfig = argv.config;
var hasInlineArgs = areArgsConsistent(argv.input, argv.output);

if (hasInlineArgs) {
  links = gatherLinks(argv.input, argv.output);

  if (hasConfig) {
    log(JSON.stringify(links));
    process.exit(0);
  }
} else if (hasConfig) {
  links = loadJSON(pathUtils.resolve('.', argv.config));
} else {
  yargs.showHelp();
  process.exit(1);
}

for (source in links) {
  watch(source, links[source]);
}


