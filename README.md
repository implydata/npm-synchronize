# npm-synchronize
A tool to synchronize different npm packages' directories

## Installation
`npm i -g npm-synchronize`

## Usage

### Prerequisites
Let's assume all projects (dependencyProject and mainProject) are located inside of `~/Projects`.

### Setting up dependencyProject and mainProject, and linking them together
1. Open a terminal window, then go to the dependencyProject project's root folder (`cd ~/Projects/dependencyProject`)
1. Watch for changes (`grunt watch`)
1. Open another terminal window, then go to the mainProject project's root folder (`cd ~/Projects/mainProject`)
1. Watch for changes (`./watch`)
1. Open another terminal window, then go to the Projects folder (`cd ~/Projects`)
1. Watch for changes in dependencyProject and update mainProject accordingly (`npm-synchronize -i dependencyProject -o mainProject`)

## Notes
npm-synchronize's watch can be configured through a config file (`npm-synchronize -h` for more information).
