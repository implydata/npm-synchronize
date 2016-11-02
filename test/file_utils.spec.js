var chai = require('chai');
var should = chai.should();
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const fileUtils = require('./scripts/file_utils').setCwd(__dirname + '/fixtures');

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
