---
'kumihimo-obsidian': patch
---

The release glue is a script now, and it is checked on every commit.

Three releases in a row failed on the shell that assembled the plugin repository, and none
of the three was visible by reading it: a token that could not write a workflow file, a
`packageManager` field that lives on the monorepo root, and an apostrophe inside a
single-quoted `node -e` that ended the script mid-word. Each cost a release to discover.

It is `scripts/assemble.mjs` now, called from the workflow, and `scripts/check-mirror.mjs`
runs it in CI. That turned up two more of the same kind immediately:

`CORE=$(node -p …)` set a shell variable, not an environment one, so the `node -e` that read
`process.env.CORE` never saw it — **the assembled `package.json` had no dependency on the
compiler at all**. And the mirror's `scripts` were copied from this package, so it would
have carried a `test` that runs a file deliberately not shipped to it.

Seventeen things are asserted about the assembled folder now, from the compiler being
pinned to an exact version to the bundle containing no `localStorage`. The whole sequence
the plugin repository's own workflow runs — install frozen, build, typecheck, test, manifest
against version — was run in an assembled copy, and the `main.js` it produces is
byte-identical to the one that goes out.
