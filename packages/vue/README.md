# @love-rox/kumihimo-vue

Vue 3 component and composable for [kumihimo](https://github.com/Love-Rox/kumihimo) — AV signal flow diagrams
(系統図) written as text.

```bash
pnpm add @love-rox/kumihimo-vue
```

```vue
<script setup>
import { Kumihimo } from '@love-rox/kumihimo-vue';
</script>

<template>
  <Kumihimo :source="src" theme="dark" @diagnostics="report">
    <template #fallback>読み込み中…</template>
  </Kumihimo>
</template>
```

```ts
import { useKumihimo } from '@love-rox/kumihimo-vue';

const { svg, diagram, diagnostics, pending, error } = useKumihimo(() => src.value);
```

Accepts values, refs or getters, and keeps the previous diagram on screen through a
recompile.

See [kumihimo.love-rox.cc](https://kumihimo.love-rox.cc/en) for the guide and an editor you
can type into, or the [project README](https://github.com/Love-Rox/kumihimo#readme) for the
other packages.

## License

MIT © SASAGAWA Kiyoshi
