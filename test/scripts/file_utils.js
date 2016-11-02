#!/usr/bin/env node
const exec = require('child_process').exec;
const mkdirp = require('mkdirp');
const Q = require('q');
const pathUtils = require('path');
const fs = require('fs');
const rimraf = require('rimraf');


// Utils

const fileExists = (path) => {
  var targetStats;

  try {
    targetStats = fs.lstatSync(path);
  } catch (e) {
    return false;
  }

  return (targetStats.isFile() || targetStats.isDirectory());
};

const createDir = (path) => {
  if (fileExists(path)) throw new Error(path + ' already exists');

  var deferred = Q.defer();
  mkdirp(pathUtils.dirname(path), (e) => e ? deferred.reject(e) : deferred.resolve());
  return deferred.promise;
};

const writeInFile = (path, content) => {
  const deferred = Q.defer();
  fs.writeFile(path, content, (e) => e ? deferred.reject(e) : deferred.resolve());
  return deferred.promise;
};

const createFileWithContent = (path, content) => {
  if (fileExists(path)) throw new Error(path + ' already exists');
  return createDir(path).then(() => writeInFile(path, content));
};

const flattenFileStructure = (structure, path, files) => {
  path = path || '.';
  var files = [];

  for (var name in structure) {
    var item = structure[name];
    var subPath = path + '/' + name;

    if (typeof item === 'string') {
      files.push({path: subPath, content: item});
    } else {
      var subFiles = flattenFileStructure(item, subPath);

      if (subFiles.length > 0) {
        files = files.concat(subFiles);
      } else {
        files.push({path: subPath, isEmptyDirectory: true});
      }
    }
  }

  return files;
};

// End of Utils

const deletePath = (cwd, path) => {
  const deferred = Q.defer();
  rimraf(pathUtils.resolve(cwd, path), (e) => e ? deferred.reject(e) : deferred.resolve());
  return deferred.promise;
};

const inflateFileTree = (cwd, structure) => {
  var flatStructure = flattenFileStructure(structure);
  return Q.all(flatStructure.map(item => {
    let path = pathUtils.resolve(cwd, item.path);
    if (item.isEmptyDirectory) return createDir(path);
    return createFileWithContent(path, item.content);
  }));
};

const getFileContent = (cwd, path) => {
  const deferred = Q.defer();
  fs.readFile(pathUtils.resolve(cwd, path), (e, data)  => {
    e ? deferred.reject(e) : deferred.resolve(String(data));
  });
  return deferred.promise;
};

const changeFileContent = (cwd, path, content) => {
  path = pathUtils.resolve(cwd, path);

  if (!fileExists(path)) throw new Error('Can\'t change the content of ' + path + ': it doesn\'t exist');

  return writeInFile(path, content);
};

module.exports = {
  setCwd: (cwd) => {
    return {
      deletePath: (path) => deletePath(cwd, path),
      inflateFileTree: (path) => inflateFileTree(cwd, path),
      getFileContent: (path) => getFileContent(cwd, path),
      changeFileContent: (path, content) => changeFileContent(cwd, path, content),

      file: (path) => {
        return {
          getContent: () => getFileContent(cwd, path),
          setContent: (content) => changeFileContent(cwd, path, content)
        }
      }
    };
  }
};
