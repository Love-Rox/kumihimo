# kumihimo

**English** | [日本語](README.ja.md)

[![npm](https://img.shields.io/npm/v/@love-rox/kumihimo-core?label=%40love-rox%2Fkumihimo-core)](https://www.npmjs.com/package/@love-rox/kumihimo-core)
[![CI](https://github.com/Love-Rox/kumihimo/actions/workflows/ci.yml/badge.svg)](https://github.com/Love-Rox/kumihimo/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@love-rox/kumihimo-core)](LICENSE)

[**kumihimo.love-rox.cc**](https://kumihimo.love-rox.cc/en) — the guide, and an editor you can
type into without installing anything.

Write AV signal flow diagrams (系統図) as text, the way Mermaid does for flowcharts — except that the unit of connection is a **port**, not a node, and the **signal type** on a cable is information the tool understands rather than decoration.

```khm
device cam "SONY FX3"  as camera   { out SDI : sdi }
device sw  "ATEM Mini" as switcher { in 1..8 : sdi  out PGM : sdi }
device rec "HyperDeck" as recorder { in SDI : sdi }

cam.SDI -> sw.1     : sdi 30m "V-01" [color=blue]
sw.PGM  -> rec.SDI  : sdi 2m  "V-10"
```

- **`@love-rox/kumihimo-core`** — parser, validator, layout and SVG renderer
- **`@love-rox/kumihimo-cli`** — `kumihimo build` / `check` / `export` / `--watch`
- **`@love-rox/kumihimo-rehype`** — render code fences in Markdown pipelines
- **`@love-rox/kumihimo-react`** — React `<Kumihimo>` component and hook
- **`@love-rox/kumihimo-vue`** — Vue 3 `<Kumihimo>` component and composable
- **`@love-rox/kumihimo-astro`** — Astro integration and component
- **`@love-rox/kumihimo-editor`** — embeddable live editor

There is a [**VS Code extension**](https://marketplace.visualstudio.com/items?itemName=love-rox.kumihimo-vscode)
too: diagnostics as you type and a live preview beside the source.

```bash
code --install-extension love-rox.kumihimo-vscode
```

## Why

Mermaid draws nodes joined by edges. An AV system is not that. A mixer's `IN 12` is a
different thing from its `IN 13`, an SDI output cannot feed an HDMI input, and the length
and jacket colour of a cable are facts someone needs on site. A flowchart tool can draw a
picture of all this; it cannot tell you when the picture is wrong.

kumihimo can, because the model knows what a port is:

|                        | Mermaid flowchart | kumihimo                                       |
| ---------------------- | ----------------- | ---------------------------------------------- |
| Unit of connection     | node → node       | **port → port**                                |
| Meaning of a line      | arbitrary         | **signal type** (SDI / XLR / Dante …)          |
| Validation             | none              | type mismatches, direction, over-booked inputs |
| Position within a node | meaningless       | **meaningful** — `IN 1` is not `IN 2`          |

### What it catches

The faults worth catching are the ones where **the cable plugs in perfectly and nothing
works**:

```
[warning] ext.CAT → netsw.1  HDBaseT uses Cat cable and RJ45 but is not Ethernet;
                             it does not go into a switch
[warning] cam.SDI → sync.REF They only share BNC. A reference input will not lock to video
[warning] cdp.OUT → dac.IN   They only share RCA. Analogue audio into a S/PDIF input
                             produces nothing
[warning] pc.HDMI → mon.DVI  Needs an HDMI-DVI cable. Declare it with `via` and it lands
                             on the parts list
[warning] desk.OUT → amp.IN  Balanced to unbalanced: level drop and hum-loop exposure
```

Every verdict carries its reason, and the reason follows through into the cable schedule.

## Install

```bash
# Command line
pnpm add -D @love-rox/kumihimo-cli

# React / Vue
pnpm add @love-rox/kumihimo-react
pnpm add @love-rox/kumihimo-vue

# Markdown (unified / rehype)
pnpm add @love-rox/kumihimo-rehype

# Astro
pnpm add @love-rox/kumihimo-astro

# Live editor
pnpm add @love-rox/kumihimo-editor

# Core only, for building your own integration
pnpm add @love-rox/kumihimo-core
```

## Usage

### Command line

```bash
kumihimo build studio.khm -o studio.svg   # draw it
kumihimo check studio.khm                 # validate only
kumihimo build studio.khm --watch         # redraw on save
kumihimo build studio.khm --theme mono    # for a black and white print

kumihimo export studio.khm drawio         # editable draw.io file
kumihimo export studio.khm cable --stdout    # cable schedule as TSV
kumihimo export studio.khm wireless --stdout # radio paths and their channels
```

Diagnostics are printed against the line that caused them:

```
studio.khm:24:1 warning[signal-mismatch]
  ext.CAT → netsw.1: HDBaseT は Cat ケーブルと RJ45 を使うが Ethernet ではない
   |
24 | ext.CAT -> netsw.1 : hdbaset 20m "N-90"
   | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

Warnings do not fail the build by default — a wiring warning is often a choice the author
has already weighed. Use `--strict` for pipelines that want the gate.

### Markdown

````md
```kumihimo
cam.SDI -> sw.1 : sdi 30m "V-01"
```
````

```js
import rehypeKumihimo from '@love-rox/kumihimo-rehype';

unified().use(remarkParse).use(remarkRehype).use(rehypeKumihimo, { theme: 'dark' });
```

### React

```tsx
import { Kumihimo, useKumihimo } from '@love-rox/kumihimo-react';

<Kumihimo source={src} theme="dark" onDiagnostics={console.warn} />;

// or drive it yourself
const { svg, diagram, diagnostics, pending } = useKumihimo(src);
```

### Vue 3

```vue
<script setup>
import { Kumihimo } from '@love-rox/kumihimo-vue';
</script>

<template>
  <Kumihimo :source="src" theme="dark" @diagnostics="onDiagnostics" />
</template>
```

### Astro

```js
import kumihimo from '@love-rox/kumihimo-astro';

export default defineConfig({ integrations: [kumihimo({ theme: 'dark' })] });
```

Everything happens at build time, so a page ships static SVG and no JavaScript.

### Live editor

```tsx
import { KumihimoEditor } from '@love-rox/kumihimo-editor';
import '@love-rox/kumihimo-editor/styles.css';

<KumihimoEditor initialSource={src} onChange={setSrc} />;
```

Source on the left, diagram on the right, clickable diagnostics that move the caret to the
fault, cable and equipment schedules as tabs, SVG/PNG download, and share links that keep
the source in the URL fragment — where no server ever sees it.

## The language

Full specification: [docs/SPEC.md](docs/SPEC.md).

```khm
diagram "Studio A" { direction: LR, theme: light }

use "./lib/blackmagic.khm"          # equipment libraries

group rack "Main rack" {
  device sw from atem_mini_extreme  # ports come from the model
  device mixer "Yamaha DM3" as mixer {
    in  CH[1..16] : xlr             # ranges expand
    out L, R      : xlr
    io  DANTE     : dante
    @vendor "Yamaha"                # metadata reaches the equipment list
  }
}

cam.SDI  -> sw.1        : sdi 30m "V-01" [color=blue]  # jacket colour
pc.HDMI  -> mon.DVI     : hdmi via "HDMI-DVI cable"    # adapters get scheduled
mic.RF   -> rx.RF1      : uhf [ch=38]                  # wireless carries frequency
mixer.(L, R) -> sw.(AUDIO_L, AUDIO_R) : trs            # parallel runs

compat aes -> xlr : ok "house standard: under 10m"     # override a rule, with its reason
```

38 builtin signal types across video, audio, control, network, power, sync and wireless.

### Themes

`light`, `dark`, `blueprint`, and `mono` — which throws colour away and distinguishes
signals by line style, because these drawings get photocopied and taped to a rack.

## Examples

[`examples/`](examples/) holds a clean broadcast chain, a wireless rig, a rack built
entirely from equipment models, and a file of deliberate faults that all plug in perfectly.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint && pnpm format:check && pnpm typecheck && pnpm check:tsdoc
pnpm --filter kumihimo-playground dev   # the editor, standalone
```

## License

MIT © SASAGAWA Kiyoshi
