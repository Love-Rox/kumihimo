---
'@love-rox/kumihimo-core': patch
---

The formatter now gives a multi-line block's braces their own lines.

Found by running the published 0.4.0, not in a test: a block opened mid-line and closed on
another came out half-tidied, because the formatter never split a line.

```khm
adapter hd "HDMI-DVI cable" { in IN: hdmi
  out OUT : dvi }
```

The reflow is the smallest one that fixes it. Content is only ever moved across a `{` or
`}` that already spans lines; statements are never joined or split, and a block written
entirely on one line is left exactly as it was — splitting every block would be a different
formatter, and a worse one for a file full of one-port devices.

An unmatched brace, which is what a half-typed file has, is left alone rather than guessed
at. A trailing comment stays with the last piece of the line it was written on.
