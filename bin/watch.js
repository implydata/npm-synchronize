#!/usr/bin/env node

const pathUtils = require('path');
const chokidar = require('chokidar');
const { exec, spawn } = require('child_process');
const Q = require('q');
const tar = require('tar-fs')
const gunzip = require('gunzip-maybe');
const fs = require('fs')
const debounce = require('lodash.debounce');
const yargs = require('yargs');
const chalk = require('chalk');
const yesno = require('yesno');

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

  .help('h')
  .alias('h', 'help')

  .argv;


// Subroutines

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
  return Q.all(targets.map(({target}) => extractTarBall(target, dependencyName, tarBallPath)));
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

const addLink = function(links, source, target, postUpdate) {
  let targets = links[source] || [];

  if (targets.indexOf(target) === -1) targets.push({target, postUpdate});

  links[source] = targets;
};

const gatherLinks = function(input, output, postUpdate) {
  if (typeof input === 'string') {
    input = [input];
    output = [output];
    postUpdate = [postUpdate];
  }

  postUpdate = postUpdate || [];

  let links = {};

  input.forEach((source, i) => {
    addLink(links, source, output[i], postUpdate[i]);
  });

  return links;
};

const indent = function(lines, indentLevel=2) {
  var spaces = '';
  for (var i = 0; i < indentLevel; i++) spaces += ' ';

  return lines.map(l => spaces + l);
};

const watch = function(source, targets) {
  var deferred = Q.defer();
  var updateDeferred = Q.defer();

  let sourcePkg = loadJSON(pathUtils.resolve(source, 'package.json'));

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
      run(source, targets, sourcePkg, (msg) => {
        updateDeferred.resolve(msg);
        updateDeferred = Q.defer();
      });
    })
  });

  return deferred.promise;
};

const startFromConfigPath = function(path) {
  const links = loadJSON(pathUtils.resolve('.', path));

  for (source in links) {
    watch(source, links[source].map(o => {
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

    yesno.ask(`Wanna use ${jsons[0]} as a config file ? [Y/n]`, true, function(ok) {
      if (ok) {
        startFromConfigPath(jsons[0]);
      } else {
        process.exit(0);
      }
    });
  });
};

const runHook = function(hook) {
  if (!hook) return;
  spawn(hook, { shell: true, stdio: 'inherit' });
};

const dumpConfig = function(links) {
  let cleanLinks = {};

  for (source in links) {
    cleanLinks[source] = links[source].map(o => {
      if (o.postUpdate === undefined) return o.target;

      return o;
    });
  }

  log(JSON.stringify(cleanLinks));
};

const date = () => chalk.grey('[' + new Date().toLocaleTimeString() + ']');

const debug = (wut) => console.log(date() + ' ' + chalk.grey(wut));
const success = (wut) => console.log(date() + ' ' + chalk.green(wut));
const info = (wut) => console.log(date() + ' ' + chalk.blue(wut));
const warn = (wut) => console.warn(date() + ' ' + chalk.red(wut));
const log = (wut) => console.log(wut);
// End of subroutines


// Stateful stuff
var isRunning = false;
var shouldReRun = false;
const run = debounce((source, targets, sourcePkg, callback) => {
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
        callback(msg)
        return;
      }
    }).done();
}, 100);
// End of stateful stuff


if (require.main === module) { // CLI
  var links;

  var hasConfig = argv.config;
  var hasInlineArgs = areArgsConsistent(argv.input, argv.output);

  if (hasInlineArgs) {
    links = gatherLinks(argv.input, argv.output, argv.postUpdate);

    if (hasConfig) {
      dumpConfig(links)
      process.exit(0);
    }

    for (source in links) {
      watch(source, links[source]);
    }
  } else if (hasConfig) {
    startFromConfigPath(argv.config);
  } else {
    tryToFindConfig();
  }

} else { // When require'd from another script
  module.exports = watch;
}
