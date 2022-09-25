# dps-joplin
NeoVim plugin for Joplin note-taking app

**Note: this plugin is under construction**

## Installation

```
# clone the repository
git clone git@github.com:tomato3713/dps-joplin.git

## add the following lines to your vimrc or init.vim
set runtimepath^=/path_to/dps-joplin
let g:joplin_token = "${authorization token}"
let g:joplin_opener = "vsplit"
```

## Usage

### `:JoplinWinOpen`

Open the notes list in the QuickFix window. Press Enter to open the note at the current cursor line. 
For saving changes, you use `:w` command.

## Options

```
" debug on
let g:joplin_debug = true

" item opener
let g:joplin_opener = "vsplit"
```
