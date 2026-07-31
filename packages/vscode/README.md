# kumihimo for VS Code

Write AV signal flow diagrams (系統図) as text, and see them as you type.

[kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) · [the language](https://github.com/Love-Rox/kumihimo#readme)

```khm
device cam "SONY FX3"  as camera   { out SDI : sdi }
device sw  "ATEM Mini" as switcher { in 1..4 : sdi  out PGM : sdi }
device rec "HyperDeck" as recorder { in SDI : sdi }

cam.SDI -> sw.1    : sdi 30m "V-01" [color=blue]
sw.PGM  -> rec.SDI : sdi 2m  "V-10"
```

## What it does

**Diagnostics as you type.** Not only syntax. The connections are judged on whether they
can physically work, and every verdict carries its reason.

```
warning [signal-mismatch]  ext.CAT → netsw.1
  HDBaseT は Cat ケーブルと RJ45 を使うが Ethernet ではない。スイッチには挿せない
```

That cable seats perfectly and carries nothing. So do `dmx`↔`xlr`, `rca`↔`spdif`,
`genlock`↔`sdi` and the rest — the faults worth catching are the ones a drawing tool
cannot see.

**Live preview.** `⌘K V` / `Ctrl+K V`, or the button in the editor title bar. It redraws
as you type and follows your colour theme, unless the source names a theme itself.

**Completions**, read from the compiler itself. Signal types after `:` and `|`, device kinds
after `as`, jacket colours inside `[color=`, themes and directions in a `diagram` block.
Every name offered is one the compiler accepts, because both read the same list — and the
connectors are shown beside each type, which is how `trs` (1/4") and `trs35` (3.5mm) are
told apart at the point of choosing.

**Syntax highlighting** and the usual bracket and comment handling for `.khm`.

## Settings

| Setting                        | Default |                                                                                                                                |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `kumihimo.preview.theme`       | `auto`  | `auto` follows the editor. `light` `dark` `mono` `blueprint` force one. A `diagram { theme: … }` in the source wins over both. |
| `kumihimo.diagnostics.enabled` | `true`  | Report while editing.                                                                                                          |
| `kumihimo.diagnostics.delay`   | `250`   | Milliseconds after typing stops.                                                                                               |

## Notes

The preview shows the diagram as an image rather than as inline markup. An SVG in an
`<img>` cannot run script, and the file being compiled arrived with somebody else's
repository — that removes the risk rather than filtering it.

The extension ships as a single bundled file. See `THIRD-PARTY-NOTICES.txt` for what is
inside it; elkjs in particular is EPL-2.0.

## License

MIT © SASAGAWA Kiyoshi
