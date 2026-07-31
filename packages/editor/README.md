# @love-rox/kumihimo-editor

Embeddable live editor for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-editor
```

```tsx
import { KumihimoEditor } from '@love-rox/kumihimo-editor';
import '@love-rox/kumihimo-editor/styles.css';

<KumihimoEditor initialSource={src} onChange={setSrc} />;
```

Source on one side, diagram on the other. Diagnostics are clickable and move the caret to
the fault. Cable, equipment and adapter schedules sit beside the drawing as tabs rather
than behind an export nobody finds. SVG and PNG download, and share links that keep the
source in the URL **fragment** — a wiring plan is often commercially sensitive and has no
business in anyone's access logs.

The parts are exported separately (`DiagnosticList`, `ScheduleTable`, `buildShareUrl`,
`downloadPng`, `sanitizeSvg`) for hosts that want a different arrangement.

See [kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) for the guide and an editor you
can type into, or the [project README](https://github.com/Love-Rox/kumihimo#readme) for the
other packages.

## License

MIT © SASAGAWA Kiyoshi
