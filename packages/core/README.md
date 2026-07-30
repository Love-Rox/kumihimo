# @love-rox/kumihimo-core

Parser, model, validator, layout and SVG renderer for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-core
```

The engine. Text in, a validated model and an SVG out, with nothing that touches a
filesystem or a DOM — so the same code runs in a browser, a Markdown pipeline and a CLI.

```ts
import { compile } from '@love-rox/kumihimo-core';

const { svg, diagram, diagnostics } = await compile(source, { theme: 'dark' });
```

It never throws. Every stage collects diagnostics and returns a best-effort result,
because a picture of a flawed system is exactly what an author needs in order to see the
flaw.

Also exports the pipeline in pieces (`parse`, `buildModel`, `layoutDiagram`, `renderSvg`),
the schedules (`cableSchedule`, `equipmentSchedule`, `adapterSchedule`) and the draw.io
exporter (`toDrawio`).

Importing other files with `use` needs a resolver, which the caller supplies — that is how
core stays free of I/O.

See the [project README](https://github.com/Love-Rox/kumihimo#readme) for the language and
the other packages.

## License

MIT © SASAGAWA Kiyoshi
