# kumihimo-obsidian

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
