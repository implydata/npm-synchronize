#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var pathUtils = require("path");
var chokidar = require("chokidar");
var child_process_1 = require("child_process");
var path = require("path");
var Q = require("q");
var fs = require("fs-extra");
var yargs = require("yargs");
var logger_1 = require("./logger");
var updateNotifier = require("update-notifier");
var pkg = require(path.resolve(__dirname, '../package.json'));
updateNotifier({ pkg: pkg }).notify();
var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var debounce = require('lodash.debounce');
var yesno = require('yesno');
var argv = yargs
    .usage([
    'Usage: $0 -i [PATH] -o [PATH]',
    '       $0 -c [PATH]',
    '       $0 -c -i [PATH] -o [PATH]'
].join('\n'))
    .example('$0 -i ../caladan -o ../im-pivot', 'Updates im-pivot each time caladan is built')
    .option('input', {
    alias: 'i',
    type: 'string',
    describe: 'Input directory (must be a NPM package)'
})
    .option('output', {
    alias: 'o',
    type: 'string',
    describe: 'Output directory (must be a NPM package)'
})
    .option('post-update', {
    alias: 'u',
    type: 'string',
    describe: 'Post update hook'
})
    .option('config', {
    alias: 'c',
    type: 'string',
    describe: 'A JSON config file (if used with other arguments, will just output the generated config on stdin)'
})
    .boolean('verbose')
    .alias('v', 'verbose')
    .describe('v', 'Verbose')
    .boolean('once')
    .describe('once', 'Once')
    .help('h')
    .alias('h', 'help')
    .argv;
var areArgsConsistent = function (input, output) {
    if (!input || !output)
        return false;
    if (typeof input === 'string' && typeof output === 'string')
        return true;
    if (typeof input !== typeof output)
        return false;
    if (input.length !== output.length)
        return false;
    return true;
};
var loadJSON = function (path) {
    try {
        return require(path);
    }
    catch (e) {
        throw new Error('Unable to read ' + path);
    }
};
var prepareTarBall = function (source) {
    if (!source)
        throw new Error('must have source');
    var deferred = Q.defer();
    child_process_1.exec('npm pack', { cwd: source }, function (error, stdout, stderr) {
        if (error)
            throw error;
        var stdoutLines = String(stdout).split(/[\r\n]+/g);
        if (stdoutLines[stdoutLines.length - 1] === '')
            stdoutLines.pop();
        var tarballName = stdoutLines[stdoutLines.length - 1];
        if (tarballName.indexOf('.tgz') === -1)
            throw new Error("can not detect tarball name in stdout " + stdout);
        var tarBallPath = pathUtils.resolve(source, tarballName);
        deferred.resolve(tarBallPath);
    });
    return deferred.promise;
};
var removeTargetModule = function (target, dependencyName, tarBallPath) {
    var deferred = Q.defer();
    fs.remove(pathUtils.resolve(target, 'node_modules', dependencyName), function (err) {
        console.log(err);
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve();
        }
    });
    return deferred.promise;
};
var extractTarBall = function (target, dependencyName, tarBallPath) {
    var deferred = Q.defer();
    fs.createReadStream(tarBallPath)
        .pipe(gunzip())
        .pipe(tar.extract(pathUtils.resolve(target, 'node_modules', dependencyName), {
        map: function (header) {
            header.name = header.name.replace(/^package\//, '');
            return header;
        }
    }))
        .on('error', function (e) { return deferred.reject(e); })
        .on('finish', function () { return deferred.resolve(tarBallPath); });
    return deferred.promise;
};
var extractTarBalls = function (targets, dependencyName, tarBallPath) {
    return Q.all(targets.map(function (_a) {
        var target = _a.target;
        return removeTargetModule(target, dependencyName, tarBallPath)
            .then(function () { return extractTarBall(target, dependencyName, tarBallPath); });
    }));
};
var removeTarBall = function (tarBallPath) {
    var deferred = Q.defer();
    fs.unlink(tarBallPath, function () { return deferred.resolve(); });
    return deferred.promise;
};
var removeTarBalls = function (paths) {
    return Q.all(paths.map(removeTarBall));
};
var getFilesToWatch = function (input, sourcePkg) {
    if (!sourcePkg.files) {
        logger_1.warn("Watching entire directory (" + input + ") for " + sourcePkg.name + ", this might be hazardous...");
        return [pathUtils.resolve(input)];
    }
    return sourcePkg.files.map(function (f) { return pathUtils.resolve(input, f); });
};
var addLink = function (links, source, target, postUpdate) {
    var targets = links[source] || [];
    if (targets.filter(function (t) { return t.target === target; }).length === 0)
        targets.push({ target: target, postUpdate: postUpdate });
    links[source] = targets;
};
var gatherLinks = function (input, output, postUpdate) {
    if (typeof input === 'string')
        input = [input];
    if (typeof output === 'string')
        output = [output];
    if (typeof postUpdate === 'string')
        postUpdate = [postUpdate];
    postUpdate = postUpdate || [];
    var links = {};
    input.forEach(function (source, i) {
        addLink(links, source, output[i], postUpdate[i]);
    });
    return links;
};
var watch = function (source, targets) {
    var deferred = Q.defer();
    var updateDeferred = Q.defer();
    var sourcePkg = loadJSON(pathUtils.resolve(source, 'package.json'));
    var filesToWatch = getFilesToWatch(source, sourcePkg);
    var watcher = chokidar.watch(filesToWatch, { ignored: /[\/\\]\./ });
    watcher.on('ready', function () {
        logger_1.info('Ready, watching following files/patterns:\n' + logger_1.indent(filesToWatch).join('\n'));
        deferred.resolve({
            close: watcher.close.bind(watcher),
            waitForUpdate: function () { return updateDeferred.promise; }
        });
        watcher.on('all', function (event, path) {
            if (argv.verbose)
                logger_1.debug(path + "\t[" + event + "]");
            run(source, targets, sourcePkg, function (msg) {
                updateDeferred.resolve(msg);
                updateDeferred = Q.defer();
            });
        });
    });
    return deferred.promise;
};
var startFromConfigPath = function (path) {
    var config = { links: loadJSON(pathUtils.resolve('.', path)) };
    for (var source in config.links) {
        watch(source, config.links[source].map(function (o) {
            if (typeof o === 'string')
                return { target: o };
            return o;
        }));
    }
};
var tryToFindConfig = function () {
    var jsonRegExp = /.*\.json$/;
    fs.readdir('.', function (err, files) {
        var jsons = files.filter(jsonRegExp.exec.bind(jsonRegExp));
        if (jsons.length !== 1) {
            yargs.showHelp();
            process.exit(1);
        }
        yesno.ask("Wanna use " + jsons[0] + " as a config file ? [Y/n]", true, function (ok) {
            if (ok) {
                startFromConfigPath(jsons[0]);
            }
            else {
                process.exit(0);
            }
        });
    });
};
var runHook = function (hook) {
    if (!hook)
        return;
    child_process_1.spawn(hook, [], { shell: true, stdio: 'inherit' });
};
var dumpConfig = function (links) {
    var cleanLinks = {};
    for (var source in links) {
        cleanLinks[source] = links[source].map(function (o) {
            if (o.postUpdate === undefined)
                return o.target;
            return o;
        });
    }
    logger_1.log(JSON.stringify(cleanLinks));
};
var isRunning = false;
var shouldReRun = false;
var run = debounce(function (source, targets, sourcePkg, callback) {
    if (isRunning) {
        shouldReRun = true;
        return;
    }
    isRunning = true;
    return prepareTarBall(source)
        .then(function (tarBallPath) { return extractTarBalls(targets, sourcePkg.name, tarBallPath); })
        .then(removeTarBalls)
        .then(function () {
        isRunning = false;
        if (shouldReRun) {
            logger_1.info('Package updated during copy, running again...');
            shouldReRun = false;
            return run(source, targets, sourcePkg, callback);
        }
        else {
            var msg = targets.map(function (t) { return t.target; }) + ' updated with ' + source;
            targets.forEach(function (_a) {
                var postUpdate = _a.postUpdate;
                return runHook(postUpdate);
            });
            logger_1.success(msg);
            callback && callback(msg);
            return;
        }
    }).done();
}, 100);
if (require.main === module) {
    var links = void 0;
    var hasConfig = argv.config != null;
    var hasInlineArgs = areArgsConsistent(argv.input, argv.output);
    if (hasInlineArgs) {
        links = gatherLinks(argv.input, argv.output, argv['post-update']);
        if (hasConfig) {
            dumpConfig(links);
            process.exit(0);
        }
        if (argv.once) {
            for (var source in links) {
                run(source, links[source], loadJSON(pathUtils.resolve(source, 'package.json')));
            }
        }
        else {
            for (var source in links) {
                watch(source, links[source]);
            }
        }
    }
    else if (hasConfig) {
        startFromConfigPath(argv.config);
    }
    else {
        tryToFindConfig();
    }
}
else {
    module.exports = watch;
}
