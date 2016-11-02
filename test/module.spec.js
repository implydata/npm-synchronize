const Q = require('q');
var chai = require('chai');
var should = chai.should();
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const fileUtils = require('./scripts/file_utils').setCwd(__dirname + '/fixtures');

const watch = require('../bin/watch');

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

describe('Module', () => {
  var watcher;

  describe('single watch', () => {
    beforeEach((done) => {
      watch('test/fixtures/sourceA', ['test/fixtures/targetA'])
        .then(w => {
          watcher = w;
          done();
        });
    });

    afterEach(() => {
      watcher.close();
    });

    it('should copy a changed file', () => {
      let file = fileUtils.file('sourceA/build/fileA');

      return file.setContent('POUET')
        .then(watcher.waitForUpdate)
        .then(() => {
          return fileUtils.file('targetA/node_modules/sourceA/build/fileA')
            .getContent()
            .should.eventually.equal('POUET');
        })
      ;
    });
  });
});

