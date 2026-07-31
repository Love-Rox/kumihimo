/**
 * Bundle the extension into one file.
 *
 * CommonJS, because that is what the VS Code extension host loads, whatever the manifest's
 * `type` says about the rest of the package.
 *
 * Bundled rather than shipped with node_modules: pnpm installs through symlinks, and the
 * packaging step follows them into a store that is not part of the .vsix. That means elkjs
 * ends up inside the file we distribute, which is why build-notices.mjs exists next door.
 */

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generating the notices here, not in the packaging script, so that no route to a bundle
// can skip them: `vsce package` run by hand would otherwise ship without a notice and say
// nothing about it.
import './build-notices.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const result = await build({
  entryPoints: [resolve(here, '../src/extension.ts')],
  outfile: resolve(here, '../dist/extension.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Supplied by the host at runtime and not resolvable from disk.
  external: ['vscode'],
  minify: !watch,
  sourcemap: watch,
  logLevel: 'info',
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`dist/extension.cjs  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
