---
'kumihimo-obsidian': patch
---

Answer what the directory's review said.

**The source has to be in the repository.** Closed source is not accepted, and the review
was right to say so: what somebody installs is a 1.5 MB minified bundle, and there was
nothing beside it to read before trusting it. The mirror now carries `src`, the build
script, a `tsconfig` whose `extends` points somewhere that exists, and a `package.json`
depending on the published compiler rather than on a workspace that is not there.

Checked by doing it — the assembled folder was copied somewhere with no monorepo above it,
installed, and built. `build`, `typecheck` and `test` all pass, and the `main.js` that comes
out is byte-identical to the one attached to the release. Two things had to be fixed to
make that true, and neither would have been found any other way: `typescript` and
`@types/node` came from the monorepo root, and the `tsconfig` extended `../../`.

**No more `localStorage`.** The plugin was reading Obsidian's own interface language out of
it. That reaches past the plugin data API, and it also answers the wrong question — the
language somebody wants their menus in is not necessarily the one they want their diagrams
in. It is a setting now, saved the way settings are saved, and asked plainly.

**`authorUrl` points at a profile** rather than at the repository.

**Artifact attestations** on `main.js` and `styles.css`. A fair thing to ask for a bundle
this size: it is how a reader checks the file came from the source sitting beside it.
