const Q = require('q');
var chai = require('chai');
var should = chai.should();
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const { startWatcher, wait } = require('./scripts/process_utils');
const fileUtils = require('./scripts/file_utils').setCwd(__dirname + '/fixtures-cli');

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
      'test/fixtures-cli/sourceA': [
        'test/fixtures-cli/targetA',
        'test/fixtures-cli/targetB'
      ]
    })
  });
});

afterEach(() => {
  return fileUtils.deletePath('.'); // === cwd
});

describe('CLI', () => {

  describe('single watch', () => {
    var process;

    beforeEach(() => {
      return startWatcher(executableName, ['-i', 'test/fixtures-cli/sourceA', '-o', 'test/fixtures-cli/targetA', '-v'])
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
      return startWatcher(executableName, ['-i', 'test/fixtures-cli/sourceA', '-o', 'test/fixtures-cli/targetA', '-i', 'test/fixtures-cli/sourceA', '-o', 'test/fixtures-cli/targetB', '-v'])
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
      return startWatcher(executableName, ['-c', 'test/fixtures-cli/config.json', '-v'])
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
      return startWatcher(executableName, ['-i', 'test/fixtures-cli/sourceA', '-o', 'test/fixtures-cli/targetA', '-c'])
        .should.eventually.be.equal(`{"test/fixtures-cli/sourceA":["test/fixtures-cli/targetA"]}\n`);
    });
  });

  describe('with a source that is not an npm package', () => {
    it('should exit(1)', () => {
      return startWatcher(executableName, ['-i', 'test/fixtures-cli', '-o', 'test/fixtures-cli/targetA', '-v'])
        .should.eventually.be.rejectedWith('Premature exit with code 1');
    });
  });

});

