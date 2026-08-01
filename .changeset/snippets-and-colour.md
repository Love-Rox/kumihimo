---
'kumihimo-vscode': minor
'@love-rox/kumihimo-core': patch
---

Nineteen snippets, and the keywords that were never coloured.

`adapter` and `over` were not coloured — the grammar's keyword list predates both — and
neither were `via`, `from` and `as`. All are now.

Nineteen snippets cover every declaration the language has, so the shape of one can be
inserted rather than remembered. Where a word comes from a fixed list — device kinds,
signal types, themes, units — the snippet offers that list rather than a blank to guess at.

The snippets are checked against the compiler rather than against themselves: every word
offered in a choice list has to be one the compiler accepts, and every skeleton has to
parse once its placeholders are filled. A snippet that inserts something the compiler
rejects teaches the wrong thing, which is worse than offering nothing.

Nothing in core.
