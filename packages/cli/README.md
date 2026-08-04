# @love-rox/kumihimo-cli

Command line interface for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-cli
```

```bash
kumihimo build studio.khm -o studio.svg   # draw it
kumihimo check studio.khm                 # validate only
kumihimo build studio.khm --watch         # redraw on save
kumihimo export studio.khm drawio         # editable draw.io file
kumihimo export studio.khm cable --stdout    # cable schedule as TSV
kumihimo export studio.khm wireless --stdout # radio paths and their channels
```

Diagnostics are printed against the line that caused them, with the offending span
underlined. Warnings do not fail the build unless you pass `--strict`.

## From a pipe

`-` reads standard input and `--stdout` writes the drawing to standard output, so a diagram
can be produced from text that was never a file:

```bash
cat studio.khm | kumihimo - --stdout > studio.svg
```

The report goes to standard error, so redirecting standard output gives an SVG and nothing
else. Imports inside a piped diagram resolve against the working directory, which is the only
thing a pipe can be relative to.

This is what a note-taking tool needs when it renders a fenced block by running a command
rather than by loading an extension.

Installs as both `kumihimo` and `khm`.

See [kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) for the guide and an editor you
can type into, or the [project README](https://github.com/Love-Rox/kumihimo#readme) for the
other packages.

## Markdown Preview Enhanced

MPE renders a fenced block by **running a command**, which is the only way in: it reads none
of the VS Code extension's contributions. `stdin=true` hands the block to the command, and
`--quiet` keeps the report out — MPE concatenates standard error into the output, so a clean
run's `✓` would otherwise land in the page beside the drawing.

````markdown
```kumihimo {cmd="kumihimo" args=["-", "--stdout", "--quiet"] stdin=true output="html"}
device cam "SONY FX3"  as camera   { out SDI : sdi }
device sw  "ATEM Mini" as switcher { in 1 : sdi }

cam.SDI -> sw.1 : sdi 30m "V-01"
```
````

MPE asks before it runs anything. `$input_file` in `args` works too — it is replaced with a
temporary file — but `stdin=true` is better here: MPE runs the command in the document's own
directory, so a `use` of a file beside the note resolves the way it reads.

A faulty diagram still draws, with the faults visible in the drawing rather than in a report
that is not being shown.

## License

MIT © SASAGAWA Kiyoshi
