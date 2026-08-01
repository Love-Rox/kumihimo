/**
 * Check the folder that goes to the plugin repository.
 *
 * Separate from the plugin's own smoke test because it belongs to a different place: this
 * asks whether the mirror can be assembled, and the mirror has no assemble script in it —
 * checking that it can be built is not the mirror's job, it is this repository's.
 *
 * Three releases failed in a row on the shell this replaced, and none of the three was
 * visible by reading it. Running it is the only thing that finds them.
 */

import { access, mkdtemp, readFile as read } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { assemble } from './assemble.mjs';

// ── the folder that goes to the plugin repository ───────────────────────────
//
// Three releases failed in a row on the shell that used to build this, and none of the
// three was visible by reading it. It is a script now, and this is where it gets run.

console.log('\n配布フォルダの組み立て:');

const out = await mkdtemp(resolve(tmpdir(), 'kumihimo-mirror-'));
const version = await assemble(out);
console.log(`  ○ 組み立てられる (${version})`);

// Every file the directory reads, and the source it refuses to go without.
for (const name of [
  'main.js',
  'manifest.json',
  'styles.css',
  'README.md',
  'LICENSE',
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'src/main.ts',
  'src/settings.ts',
  'scripts/build.mjs',
  '.github/workflows/release.yml',
]) {
  await access(resolve(out, name)).catch(() => {
    throw new Error(`${name} が入っていません`);
  });
}
console.log('  ○ ソースも含めて必要なファイルが揃う');

const shipped = JSON.parse(await read(resolve(out, 'package.json'), 'utf8'));

// The one that would have shipped a plugin depending on nothing: `CORE=$(…)` set a shell
// variable, and the `node -e` that read `process.env.CORE` never saw it.
const pinned = shipped.dependencies?.['@love-rox/kumihimo-core'];
console.log(`  ${pinned ? '○' : '×'} コンパイラへの依存: ${pinned ?? 'なし'}`);
if (!pinned) throw new Error('コンパイラへの依存が入っていません');
if (/^[\^~]/.test(pinned)) throw new Error(`版が範囲指定です: ${pinned}`);
console.log('  ○ 範囲ではなく正確な版');

// The one that stopped the mirror installing at all.
console.log(`  ${shipped.packageManager ? '○' : '×'} packageManager: ${shipped.packageManager}`);
if (!shipped.packageManager) throw new Error('packageManager がありません');

for (const dep of ['typescript', '@types/node', 'obsidian', 'esbuild']) {
  if (!shipped.devDependencies?.[dep]) throw new Error(`${dep} が devDependencies にありません`);
}
console.log('  ○ 単体でビルドできる devDependencies');

// The tsconfig no longer points at a parent that is not there.
const ts = await read(resolve(out, 'tsconfig.json'), 'utf8');
if (ts.includes('../../')) throw new Error('tsconfig が monorepo の外を指しています');
console.log('  ○ tsconfig の extends が解決できる');

// The submission requirements, against the assembled folder rather than the source.
const manifest = JSON.parse(await read(resolve(out, 'manifest.json'), 'utf8'));
const requirements = [
  ['id が obsidian を含まない', !manifest.id.includes('obsidian')],
  ['version が x.y.z', /^\d+\.\d+\.\d+$/.test(manifest.version)],
  ['manifest と package.json の版が一致', manifest.version === shipped.version],
  ['minAppVersion がある', Boolean(manifest.minAppVersion)],
  ['説明 250 文字以内', manifest.description.length <= 250],
  ['説明がピリオドで終わる', manifest.description.endsWith('.')],
  ['説明が ASCII のみ', !/[^\x20-\x7E]/.test(manifest.description)],
  ['fundingUrl なし', manifest.fundingUrl === undefined],
  ['authorUrl がリポジトリではない', !/github\.com\/[^/]+\/[^/]+/.test(manifest.authorUrl ?? '')],
];
for (const [name, ok] of requirements) {
  console.log(`  ${ok ? '○' : '×'} ${name}`);
  if (!ok) throw new Error(name);
}

// Nothing reaches past the plugin data API.
const bundle = await read(resolve(out, 'main.js'), 'utf8');
if (bundle.includes('localStorage') || bundle.includes('sessionStorage')) {
  throw new Error('バンドルに localStorage が残っています');
}
console.log('  ○ バンドルに localStorage が無い');
