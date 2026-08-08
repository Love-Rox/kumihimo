---
'@love-rox/kumihimo-core': patch
---

The `duplicate-connection` message names both ends again.

It was built by taking the key the two port ids are stored under and swapping the separator
for an arrow — except the separator was a NUL byte that had been typed into the source rather
than written as an escape. The swap looked for a space, found none, and the sentence reached
the reader as `a.OUT`, a control character, `b.IN`.

Everywhere the message goes: the command line, the VS Code problems panel, the diagnostics
under a diagram in a note.

The key still separates the two ids with a NUL, now written as an escape; the sentence is
built from the ids instead of from the key. A key is a key and a sentence is a sentence, and
the two stopped being the same string the moment the separator did.

The stray byte also made `packages/core/src/build.ts` read as binary to `grep` and `file`,
which is how it stayed invisible.
