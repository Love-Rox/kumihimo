---
'@love-rox/kumihimo-core': patch
'kumihimo-vscode': patch
---

`as cable` no longer gets told to use `via`, and the formatter edits only what changed.

An adapter written `as cable` was still being reported as a lead that ought to be a `via`.
It is one — that is what the author wrote. The two are different ways of saying it: `via`
names a part on somebody else's run, `as cable` gives the part a row and a number of its
own, which is the one you want when the thing has a part number. The schedules were already
correct; only the message was wrong, and being an error it failed `--strict`.

The formatter replaced the whole document whenever anything changed. That is a line of code
and a bad idea: the editor invalidates everything and re-tokenises it, folds collapse, and
the change event coming back out sets this extension's own diagnostics and preview
redrawing again — on save, when several things are already competing for the moment.

Now it sends one edit spanning the changed lines. Aligning a block in a 300-line file went
from 4,411 characters to 33.

The smoke test caught the change as a regression, which is what it is for: it had been
reading the edit's text as the finished document, which was only ever true because the
formatter replaced everything. It now applies the edit the way the editor would, and checks
the property the whole-document version got for free — that what the editor ends up holding
is what the formatter meant to write.
