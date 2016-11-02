# npm-synchronize
A tool to ease development of dependant npm projects

### Why does this exist ?
Because sometimes, you just don't want to put all your eggs in the same basket. Say you're working on a project that involves lots of stuff. Say you decide one day to externalize the UI components and make them a separate project that your main one will depend on. Say you rely on NPM to do that (you totally should). One day will come where you have to update the library and see what happens in your main project. This day, chances are that you won't want to publish a dozen new versions of your library until you decide the update is actually satisfying.

### Okay but what does it do exactly ?
It does what you'll do manually, but better, if you wanted to copy your library's "build" files into your main project's node_modules' directory. It leverages an awesome feature of NPM: `npm pack`. This command does everything that `npm publish` does, except that instead of actually publishing stuff, it packs it into a tarball. `npm-synchronize` watches a project, packs it and then unpacks it in the right place. See, it's better than copying an entire folder or symlinking it, because it only packs what would be published.

**It's exactly like publishing, but locally and without the need to bump the version number.**

Of course, later on you'll want to actually publish your stuff, but this is taken care of quite wonderfully by NPM.

## Documentation

### Installation
`npm i -g npm-synchronize`

### Usage

Let's assume all projects (dependencyProject and mainProject) are located inside of `~/Projects`.

`npm-synchronize -i dependencyProject -o mainProject`

### Alternative usage (from a config file)
npm-synchronize can be configured through a config file (`npm-synchronize -h` for more information).
