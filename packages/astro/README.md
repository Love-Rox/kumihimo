# @love-rox/kumihimo-astro

Astro integration and component for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-astro
```

```js
import kumihimo from '@love-rox/kumihimo-astro';

export default defineConfig({ integrations: [kumihimo({ theme: 'dark' })] });
```

Renders kumihimo code fences in Markdown and MDX. For `.astro` files:

```astro
---
import Kumihimo from '@love-rox/kumihimo-astro/Kumihimo.astro';
---
<Kumihimo source={src} theme="dark" />
```

Astro components are async and run at build time, so this awaits the compile directly: the
page ships static SVG with no layout engine in the bundle and nothing to hydrate.

See [kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) for the guide and an editor you
can type into, or the [project README](https://github.com/Love-Rox/kumihimo#readme) for the
other packages.

## License

MIT © SASAGAWA Kiyoshi
