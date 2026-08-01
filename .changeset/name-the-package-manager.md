---
'kumihimo-obsidian': patch
---

The mirror says which pnpm to use.

The plugin repository's own workflow could not get as far as installing: `pnpm/action-setup`
refuses to guess a version, and the `packageManager` field it reads lives on the monorepo
root, which is not there once the package is the whole repository.

Assembled and run through end to end this time — install frozen, build, typecheck, test,
and the manifest checked against the version — rather than only the steps I had thought to
try. The first two attempts each failed on something upstream of what I had verified: a
token that could not write a workflow file, and then this.
