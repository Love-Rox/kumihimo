---
'kumihimo-vscode': minor
---

A trace log, and a preview that cannot wedge itself shut.

A freeze on save was reported that could not be reproduced here — compilation is 0.3 ms for
diagnostics and about 10 ms for a whole render, and repeating it a hundred times leaks
neither memory nor handles. The honest answer to "what should I look at" was four places to
hunt by hand, which is not an answer.

`kumihimo.trace`, and **kumihimo: Show the trace log** to turn it on and open it. Each
redraw writes what it cost, split into compiling, building the markup, and handing that
markup to the editor — the last of which is the editor's cost rather than ours, and the one
worth knowing about when a save feels slow.

The other half of the report was that it eventually stops redrawing altogether. A render
holds a flag that stops a second one starting beside it, and that flag is cleared in a
`finally` — so it can only stick if the work never settles at all. Now it cannot stick: a
render is abandoned after fifteen seconds, the log says so, and the next keystroke draws.

Nothing here is expected to take fifteen seconds. If the log ever shows that line, it is
the evidence the report needed.
