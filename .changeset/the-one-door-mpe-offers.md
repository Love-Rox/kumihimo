---
'@love-rox/kumihimo-cli': minor
'kumihimo-vscode': patch
---

A diagram in a Markdown Preview Enhanced note, and `--quiet` to make it possible.

MPE is not VS Code's Markdown preview: it reads none of the extension's contributions, so a
` ```kumihimo ` block stays a code block there and says nothing about why. It offers one door
to everybody — a code chunk that runs a command — and now that door works.

````markdown
```kumihimo {cmd="kumihimo" args=["-", "--stdout", "--quiet"] stdin=true output="html"}

```
````

`--quiet` is not decoration. MPE **concatenates standard error into the output**, so a clean
run's `✓ 問題は見つかりませんでした` would land in the page beside the drawing. Read out of
MPE's own bundle rather than guessed, along with how the block reaches the command:
`stdin=true` writes it to standard input, `$input_file` in `args` is replaced with a
temporary path, and neither appends the path as the last argument.

`stdin=true` is the one documented, because MPE runs the command in the document's own
directory — so a `use` of a file beside the note resolves the way it reads, where a temporary
file would not.

A smoke test drives the command exactly as MPE drives it, including concatenating both
streams, and asserts the output is an SVG and nothing else. One of its five checks asserts
that _without_ `--quiet` the report does come along, so the flag cannot quietly stop being
needed without somebody noticing.
