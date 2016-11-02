#!/usr/bin/env node
const spawn = require('child_process').spawn;
const Q = require('q');

module.exports = {
  startWatcher: (cmd, args) => {
    let startDeferred = Q.defer();
    let endDeferred = Q.defer();
    let updateDeferred = Q.defer();

    let process = spawn(cmd, args);

    let outputs = [];

    process.stdout.on('data', (data) => {
      data = String(data);
      outputs.push(data);

      if (data.startsWith('Watching files in')) {
        startDeferred.resolve({
          kill: () => {
            process.kill();
            return endDeferred.promise;
          },
          waitForUpdate: () => updateDeferred.promise
        });
      } else if (data.search(' updated ') > -1) {
        updateDeferred.resolve();
        updateDeferred = Q.defer();
      }
    });

    process.stdout.on('end', (data) => {
      // console.log('end ' + data);
    });

    // process.stderr.on('data', (data) => {
    //   throw new Error('stderr ' + String(data));
    // });

    process.on('exit', (code) => {
      if (startDeferred.promise.inspect().state === 'pending') {
        if (code === 0) {
          startDeferred.resolve(outputs.join('\n'));
        } else {
          startDeferred.reject('Premature exit with code ' + code);
        }

        return;
      }

      if (code && code !== 0) {
        endDeferred.reject(cmd + ' exited with code ' + code);
      } else {
        endDeferred.resolve();
      }
    });

    return startDeferred.promise;
  },

  wait: (milliseconds) => {
    let deferred = Q.defer();
    setTimeout(() => deferred.resolve(), milliseconds);
    return deferred.promise;
  }
};
