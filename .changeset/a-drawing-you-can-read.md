---
'@love-rox/kumihimo-core': patch
'@love-rox/kumihimo-cli': minor
'kumihimo-vscode': patch
'kumihimo-obsidian': patch
---

A drawing stops shrinking before it stops being readable, and the command line takes a pipe.

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
