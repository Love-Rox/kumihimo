# kumihimo-obsidian

## 1.1.14

### Patch Changes

- Updated dependencies [d6ce614]
  - @love-rox/kumihimo-core@0.12.0

## 1.1.13

### Patch Changes

- Updated dependencies [8c11552]
  - @love-rox/kumihimo-core@0.11.1

## 1.1.12

### Patch Changes

- @love-rox/kumihimo-core@0.11.0

## 1.1.11

### Patch Changes

- Updated dependencies [c5a582b]
  - @love-rox/kumihimo-core@0.10.1

## 1.1.10

### Patch Changes

- 60d697b: A drawing stops shrinking before it stops being readable, and the command line takes a pipe.

  **Scaling had no floor.** A page fits a wide diagram into its column with `max-width: 100%`,
  which scales without limit: a 924px drawing in a 560px note came out at 61%, taking the port
  names from 10px to 6px. The box around it already scrolled — it just never got the chance,
  because the drawing shrank to fit instead.

  `legibleScale()` says how far a drawing may be scaled and still be read. The renderer chose
  the type size, so the renderer is what knows: the smallest label is three under the base
  size, and eight pixels is where a name stops being a name. Both the VS Code Markdown preview
  and the Obsidian plugin now stop there and let the box scroll from there on.

  Measured in a browser at a 560px column: 61% → **80%**, smallest text 6.1px → **8px**, the
  box scrolls, the page does not.

  **`-` and `--stdout`.** `kumihimo - --stdout` reads a diagram from standard input and writes
  the SVG to standard output, with the report on standard error so a redirect gives an SVG and
  nothing else. Imports resolve against the working directory. This is what a tool that renders
  a fenced block by running a command needs, and it is what a pipeline wants anyway.

  **The VS Code README now says which preview.** The Markdown support is a contribution the
  built-in preview reads; _Markdown Preview Enhanced_ is a separate renderer and ignores it, so
  a block stays a block there and says nothing about why. That cost an afternoon to find and
  was not written down anywhere.

- Updated dependencies [60d697b]
- Updated dependencies [49c614d]
- Updated dependencies [3c87357]
  - @love-rox/kumihimo-core@0.10.0

## 1.1.9

### Patch Changes

- Updated dependencies [9ffc0e6]
- Updated dependencies [f2fb391]
  - @love-rox/kumihimo-core@0.9.4

## 1.1.8

### Patch Changes

- Updated dependencies [c51f79b]
  - @love-rox/kumihimo-core@0.9.3

## 1.1.7

### Patch Changes

- Updated dependencies [72cf6d8]
- Updated dependencies [72cf6d8]
  - @love-rox/kumihimo-core@0.9.2

## 1.1.6

### Patch Changes

- fa9ad0c: The plugin release waits for the compiler it depends on.

  Both workflows fired on the same push, so the mirror asked npm for a compiler version that
  Release published **34 seconds later**. `ERR_PNPM_NO_MATCHING_VERSION`, on a version that
  was already on its way.

  It follows Release now rather than running beside it, and polls the registry before
  assembling anything, because "the workflow finished" and "the registry serves it" are not
  the same instant.

  Following a workflow rather than a push also means the commit before this one is not
  necessarily the one that moved the version, so the decision changed with it: it asks whether
  the plugin repository already has this release, which is the question it was really asking
  all along — and it makes a re-run after a failure do the right thing instead of nothing.

## 1.1.5

### Patch Changes

- Updated dependencies [d3efacb]
  - @love-rox/kumihimo-core@0.9.1

## 1.1.4

### Patch Changes

- 3937bdc: The release glue is a script now, and it is checked on every commit.

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

## 1.1.3

### Patch Changes

- 390e91b: The mirror says which pnpm to use.

  The plugin repository's own workflow could not get as far as installing: `pnpm/action-setup`
  refuses to guess a version, and the `packageManager` field it reads lives on the monorepo
  root, which is not there once the package is the whole repository.

  Assembled and run through end to end this time — install frozen, build, typecheck, test,
  and the manifest checked against the version — rather than only the steps I had thought to
  try. The first two attempts each failed on something upstream of what I had verified: a
  token that could not write a workflow file, and then this.

## 1.1.2

### Patch Changes

- bfc6624: Answer the second review. The error is gone; these are the four warnings left.

  **One missing file caused a hundred and twenty warnings.** Every `no-unsafe-call`,
  `no-unsafe-member-access` and `no-unsafe-assignment` was a line touching `obsidian` or the
  compiler — because with no lockfile the reviewer cannot install, so both resolve to `any`
  and every call on them is unsafe. Reproduced by deleting those two packages and running
  `tsc`: the same lines, for the same reason. The mirror ships a lockfile now, and installs
  with `--frozen-lockfile`, which is what makes a build here reproducible at all.

  **The compiler is pinned exactly** rather than with a caret. A range means somebody
  building this next year gets a different compiler than the release was built with — and
  then the bundle they produce is not the bundle that was attested.

  **The attestation moved to where it can be checked.** `attest-build-provenance` records
  against the repository that runs it, so signing from the monorepo put the provenance
  somewhere nobody checking the plugin would look. The plugin repository now builds and signs
  its own release: the monorepo pushes source and a tag, and a workflow there installs
  frozen, builds, type-checks, tests, checks the manifest matches the tag, signs, and
  attaches. What is attached is demonstrably what the checked-in source produces.

  **The settings are declared as well as drawn.** `getSettingDefinitions()` is how Obsidian
  1.13 indexes settings for the global search — a tab that only draws itself is one whose
  settings nobody can find by typing their name. `display()` stays beside it, because 1.13 is
  an insider build and `minAppVersion` here is 1.7.2; dropping it would have dropped every
  version anybody is running today.

## 1.1.1

### Patch Changes

- 2b28878: Answer what the directory's review said.

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

## 1.1.0

### Minor Changes

- 1e9e428: The Obsidian plugin is ready to submit.

  Obsidian's community directory takes a repository URL and reads `manifest.json` from the
  root of that repository's default branch. A monorepo cannot answer that, so the plugin is
  mirrored: developed here beside the compiler it uses, and pushed on release to a repository
  shaped the way the directory expects.

  `publish-obsidian.yml` builds it, runs its smoke test, assembles the five files the
  directory reads, pushes them, and cuts a release whose tag is exactly the version — which
  is the tag Obsidian looks for by name when somebody installs the plugin.

  The trigger is the version in `package.json`, not the one in the manifest. Changesets moves
  the first and the build copies it into the second; watching the manifest would have meant
  watching a file that only changes _after_ the build this workflow is deciding whether to
  run, and the release would never have fired at all. The assembled manifest is checked
  against it before anything is pushed, because a mismatch there means a release tag that
  does not exist and a plugin that simply fails to install.

  `docs/PUBLISHING.md` has the rest: the repository to create, the token it needs, and what
  the automated review checks against where each answer lives.

## 0.0.1

### Patch Changes

- Updated dependencies [4e3e0fe]
  - @love-rox/kumihimo-core@0.9.0
