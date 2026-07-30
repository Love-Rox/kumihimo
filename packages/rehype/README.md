# @love-rox/kumihimo-rehype

rehype plugin for Markdown pipelines for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-rehype
```

Turns kumihimo code fences into inline SVG at build time.

````md
```kumihimo
cam.SDI -> sw.1 : sdi 30m "V-01"
```
````

```js
import rehypeKumihimo from '@love-rox/kumihimo-rehype';

unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeKumihimo, { theme: 'dark', onDiagnostics: report })
  .use(rehypeStringify);
```

The SVG is parsed into HAST in the SVG namespace rather than emitted as a raw node, so no
`rehype-raw` is needed and no sanitiser silently drops the drawing.

Use `onDiagnostics` if you would rather not publish a nice-looking picture of faulty
wiring.

See the [project README](https://github.com/Love-Rox/kumihimo#readme) for the language and
the other packages.

## License

MIT © SASAGAWA Kiyoshi
