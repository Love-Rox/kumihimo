# @love-rox/kumihimo-react

React component and hook for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-react
```

```tsx
import { Kumihimo, useKumihimo } from '@love-rox/kumihimo-react';

<Kumihimo source={src} theme="dark" fallback={<Spinner />} onDiagnostics={report} />;

const { svg, diagram, diagnostics, pending, error } = useKumihimo(src);
```

Compiling is asynchronous, so the previous diagram stays on screen while a new one is
produced and a slow earlier compile can never overwrite a newer one. Without both, live
editing flickers and can show a stale drawing.

See [kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) for the guide and an editor you
can type into, or the [project README](https://github.com/Love-Rox/kumihimo#readme) for the
other packages.

## License

MIT © SASAGAWA Kiyoshi
