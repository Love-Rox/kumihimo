---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': minor
---

Adds a formatter: `formatSource` in core, `kumihimo fmt` on the command line, and Format
Document in VS Code.

Line-oriented rather than a print of the syntax tree. Statements here are separated by line
breaks, so lines are the unit the author already thinks in — and a tree printer would have
to reinvent comment attachment, which is where most formatters lose text.

It indents by nesting, normalises spacing, and lines the columns up down a run of similar
lines. That last one is the point: a rack list is read by scanning a column, and columns
drift the moment anybody edits a name.

```khm
device sw "ATEM Mini Extreme" as switcher {
  in  1..8             : sdi
  in  AUDIO_L, AUDIO_R : trs
  out PGM              : sdi  # main
  out STREAM           : lan
}
```

A run ends at a blank line, a lone comment, or a change of shape. Each block's columns are
its own, so widening a name in one device does not reflow another. `--no-align` gives one
space between everything, which diffs more cleanly and reads worse.

Formatting never changes what a file says. The tests assert that by compiling before and
after and comparing the models, not the text — and it settles after one pass.

`kumihimo fmt --check` fails when a file is not already laid out, for CI.
