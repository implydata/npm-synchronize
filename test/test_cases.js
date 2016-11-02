const Q = require('q');
var chai = require('chai');
var should = chai.should();
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const { startWatcher, wait } = require('./scripts/process_utils');
const fileUtils = require('./scripts/file_utils').setCwd(__dirname + '/fixtures');

// Trick to make sure the executable is published in bin
const packageJSON = require('../package.json');
const executableName = packageJSON.bin[packageJSON.name];

beforeEach(() => {
  return fileUtils.inflateFileTree({
    sourceA: {
      'package.json': JSON.stringify({name: 'sourceA', files: ['build'], "version": "0.0.1"}),
      build: {
        fileA: 'super file'
      }
    },
    targetA: {
      node_modules: {
        awesomePackage: {}
      }
    },
    sourceB: {
      'package.json': JSON.stringify({name: 'sourceA', files: ['build'], "version": "0.0.1"}),
      build: {
        fileB: 'another super file'
      }
    },
    targetB: {
      node_modules: {
        awesomePackage: {}
      }
    },
    'config.json': JSON.stringify({
      'test/fixtures/sourceA': [
        'test/fixtures/targetA',
        'test/fixtures/targetB'
      ]
    })
  });
});

afterEach(() => {
  return fileUtils.deletePath('.'); // === cwd
});

describe('File structure', () => {
  it('should be created', () => {
    return fileUtils.getFileContent('sourceA/package.json')
      .should.eventually.equal('{"name":"sourceA","files":["build"],"version":"0.0.1"}');
  });

  it('should allow changes', () => {
    let file = fileUtils.file('sourceA/package.json');

    return file.setContent('POUET')
      .then(() => file.getContent().should.eventually.equal('POUET'));
  });
});

describe('Process', () => {
  it('should start and stop', () => {
    return startWatcher(executableName, ['-i', 'test/fixtures/sourceA', '-o', 'test/fixtures/targetA'])
      .then((process) => process.kill())
    ;
  });
});

describe('Watcher', () => {

  describe('single watch', () => {
    var process;

    beforeEach(() => {
      return startWatcher(executableName, ['-i', 'test/fixtures/sourceA', '-o', 'test/fixtures/targetA', '-v'])
        .then((p) => process = p);
    });

    afterEach(() => {
      return process.kill();
    });

    it('should copy a changed file', () => {
      let file = fileUtils.file('sourceA/build/fileA');

      return file.setContent('POUET')
        .then(process.waitForUpdate)
        .then(() => {
          return fileUtils.file('targetA/node_modules/sourceA/build/fileA')
            .getContent()
            .should.eventually.equal('POUET');
        })
      ;
    });
  });

  describe('multiple watch', () => {
    var process;

    beforeEach(() => {
      return startWatcher(executableName, ['-i', 'test/fixtures/sourceA', '-o', 'test/fixtures/targetA', '-i', 'test/fixtures/sourceA', '-o', 'test/fixtures/targetB', '-v'])
        .then((p) => process = p);
    });

    afterEach(() => {
      return process.kill();
    });

    it('should copy a changed file', () => {
      let file = fileUtils.file('sourceA/build/fileA');

      return file.setContent('POUET')
        .then(process.waitForUpdate)
        .then(() => {
          return Q.all([
            fileUtils.file('targetA/node_modules/sourceA/build/fileA')
              .getContent()
              .should.eventually.equal('POUET'),
            fileUtils.file('targetB/node_modules/sourceA/build/fileA')
              .getContent()
              .should.eventually.equal('POUET')
          ]);
        })
      ;
    });
  });

  describe('multiple watch - from a config file', () => {
    var process;

    beforeEach(() => {
      return startWatcher(executableName, ['-c', 'test/fixtures/config.json', '-v'])
        .then((p) => process = p);
    });

    afterEach(() => {
      return process.kill();
    });

    it('should copy a changed file', () => {
      let file = fileUtils.file('sourceA/build/fileA');

      return file.setContent('POUET')
        .then(process.waitForUpdate)
        .then(() => {
          return Q.all([
            fileUtils.file('targetA/node_modules/sourceA/build/fileA')
              .getContent()
              .should.eventually.equal('POUET'),
            fileUtils.file('targetB/node_modules/sourceA/build/fileA')
              .getContent()
              .should.eventually.equal('POUET')
          ]);
        })
      ;
    });
  });

  describe('with both --config and inline input/output', () => {
    it('should ignore any config file and log the generated config', () => {
      return startWatcher(executableName, ['-i', 'test/fixtures/sourceA', '-o', 'test/fixtures/targetA', '-c'])
        .should.eventually.be.equal(`{"test/fixtures/sourceA":["test/fixtures/targetA"]}\n`);
    });
  });

  describe('with no arguments', () => {
    it('should exit(1)', () => {
      return startWatcher(executableName)
        .should.eventually.be.rejectedWith('Premature exit with code 1');
    });
  });

  describe('with a source that is not an npm package', () => {
    it('should exit(1)', () => {
      return startWatcher(executableName, ['-i', 'test/fixtures', '-o', 'test/fixtures/targetA', '-v'])
        .should.eventually.be.rejectedWith('Premature exit with code 1');
    });
  });

  describe('with inconsistent arguments', () => {
    it('should exit(1)', () => {
      return startWatcher(executableName, ['-i', 'test/fixtures/sourceA', '-o', 'test/fixtures/targetA', '-i', 'test/fixtures/sourceA', '-v'])
        .should.eventually.be.rejectedWith('Premature exit with code 1');
    });
  });

});

