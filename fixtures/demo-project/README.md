# demo-project

A tiny fixture project for the FS-tool stages (L3+). The agent reads these files
to answer questions about the codebase — proving it can actually see the filesystem,
not just guess.

## Structure

```
src/calculator.js   a simple calculator with add/subtract/multiply/divide
package.json        project metadata
README.md           this file
```

## The bug

`divide(a, b)` doesn't guard against `b === 0`. The agent should find this by
reading the file, not by guessing.