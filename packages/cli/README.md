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

Installs as both `kumihimo` and `khm`.

See [kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) for the guide and an editor you
can type into, or the [project README](https://github.com/Love-Rox/kumihimo#readme) for the
other packages.

## License

MIT © SASAGAWA Kiyoshi
