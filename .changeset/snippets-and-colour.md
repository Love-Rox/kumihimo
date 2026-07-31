---
'@love-rox/kumihimo-core': patch
---

Nothing in core; this notes the extension changes released alongside it.

`adapter` and `over` were not coloured — the grammar's keyword list predates both — and
neither were `via`, `from` and `as`. All are now.

Seventeen snippets, so the shape of a declaration can be inserted rather than remembered:
`device`, `adapter`, `model`, `group`, `diagram`, the connection forms including `over`
and `via`, port ranges, `signal`, `compat`, `use`.

The smoke test checks them against the compiler: every word offered in a choice list has to
be one the compiler accepts, and every skeleton has to parse once its placeholders are
filled. A snippet that inserts something the compiler rejects is worse than no snippet.
