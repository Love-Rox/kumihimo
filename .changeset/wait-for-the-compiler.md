---
'kumihimo-obsidian': patch
---

The plugin release waits for the compiler it depends on.

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
