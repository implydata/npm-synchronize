# npm-synchronize
A tool to synchronize different npm packages' directories

## Installation
`npm i -g npm-synchronize`

## Usage

Let's assume all projects (dependencyProject and mainProject) are located inside of `~/Projects`.

`npm-synchronize -i dependencyProject -o mainProject`

## Notes
npm-synchronize's watch can be configured through a config file (`npm-synchronize -h` for more information).
