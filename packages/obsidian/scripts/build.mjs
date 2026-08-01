/**
 * Bundle the plugin into the three files Obsidian loads.
 *
 * CommonJS, because that is what Obsidian's loader takes whatever the manifest says. The
 * `obsidian` module is provided by the app at runtime and must stay external — bundling it
 * would ship a second copy of the API that is not the one the app is holding.
 *
 * Bundled rather than shipped with node_modules: a plugin folder is `main.js`,
 * `manifest.json` and `styles.css`, and nothing else is loaded. That means elkjs ends up
 * inside the file we distribute, which is why the notices are generated beside it.
 */

import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../dist');
const watch = process.argv.includes('--watch');

await mkdir(out, { recursive: true });

const result = await build({
  entryPoints: [resolve(here, '../src/main.ts')],
  outfile: resolve(out, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  // Provided by the app. Bundling it would ship a second API against a different instance.
  external: ['obsidian', 'electron'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  metafile: true,
});

// The version in the manifest is the one Obsidian shows and compares; keeping it in step
// with the package by hand is the kind of thing nobody notices until a release does not
// offer itself as an update.
const pkg = JSON.parse(await readFile(resolve(here, '../package.json'), 'utf8'));
const manifestPath = resolve(here, '../manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`manifest.json → ${pkg.version}`);
}

await copyFile(manifestPath, resolve(out, 'manifest.json'));
await copyFile(resolve(here, '../styles.css'), resolve(out, 'styles.css'));

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`dist/main.js  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
