---
'kumihimo-obsidian': patch
---

Answer the second review. The error is gone; these are the four warnings left.

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
