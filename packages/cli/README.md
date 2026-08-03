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

## License

MIT © SASAGAWA Kiyoshi
