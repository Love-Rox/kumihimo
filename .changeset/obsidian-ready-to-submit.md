---
'kumihimo-obsidian': minor
---

The Obsidian plugin is ready to submit.

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
