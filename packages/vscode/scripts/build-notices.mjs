/**
 * Collect the licence notices of everything bundled into the .vsix.
 *
 * The extension is distributed as one minified file with elkjs inside it, and minification
 * strips every notice out. elkjs is EPL-2.0 or GPL-3.0-or-later; distributing it with
 * nothing saying so is the part that is not allowed, not the use of it.
 *
 * Runs before packaging and fails when a licence text cannot be found, so the notice cannot
 * drift from what actually ships.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../package.json'));

/** What the bundler pulls in. `from` names the package to resolve a transitive one through. */
const BUNDLED = [
  { name: 'elkjs', why: 'レイアウトエンジン / layout engine', from: '@love-rox/kumihimo-core' },
  { name: '@love-rox/kumihimo-core', why: 'コンパイラ / compiler' },
];

const LICENCE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md'];

/**
 * The directory a package was installed into.
 *
 * Through the resolver's own search paths, since several packages block
 * `<name>/package.json` in `exports`, and through `realpathSync`, since a resolver started
 * at a pnpm link walks the linking project's node_modules rather than the linked package's.
 */
function packageDir(name, from) {
  const req = from ? createRequire(realpathSync(join(packageDir(from), 'package.json'))) : require;
  for (const base of req.resolve.paths(name) ?? []) {
    const candidate = join(base, name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  throw new Error(`${name} をどの node_modules にも見つけられません`);
}

function readLicence(dir) {
  for (const file of LICENCE_FILES) {
    try {
      return readFileSync(join(dir, file), 'utf8').trimEnd();
    } catch {
      // Try the next spelling.
    }
  }
  return undefined;
}

/**
 * The licence text for a package.
 *
 * A workspace package has none of its own: pnpm copies the repository's LICENSE into each
 * one at publish time, so on disk here the file only exists at the root. Falling back to it
 * reproduces what a consumer of the published package would actually receive.
 */
function licenceText(dir, name) {
  const own = readLicence(dir);
  if (own !== undefined) return own;
  if (name.startsWith('@love-rox/')) return readLicence(resolve(here, '../../..'));
  return undefined;
}

const parts = [];
let missing = 0;

for (const entry of BUNDLED) {
  const dir = packageDir(entry.name, entry.from);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const text = licenceText(dir, meta.name);

  if (text === undefined) {
    console.error(`${entry.name}: ライセンス本文が見つかりません (${dir})`);
    missing += 1;
    continue;
  }

  parts.push(
    [
      '='.repeat(78),
      `${meta.name} ${meta.version}`,
      entry.why,
      `SPDX: ${meta.license ?? '(package.json に記載なし)'}`,
      meta.homepage ? `Home: ${meta.homepage}` : undefined,
      '='.repeat(78),
      '',
      text,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
  );
}

if (missing > 0) {
  console.error(`\n${missing} 件のライセンス本文を取得できませんでした。`);
  process.exit(1);
}

const header = `kumihimo for VS Code — 第三者ライセンス表記 / Third-party notices

この拡張は1つのファイルに束ねて配布されるため、以下のコンポーネントが同梱されています。
パッケージング時に、実際にインストールされているものから生成しています。

This extension ships as a single bundled file, so the components below are inside it.
Generated at packaging time from the packages actually installed.

kumihimo itself is MIT. See https://github.com/Love-Rox/kumihimo

注意 / Note: elkjs is available under EPL-2.0 or GPL-3.0-or-later, at your option. This
extension distributes it under the EPL-2.0. Its source is at https://github.com/kieler/elkjs

`;

writeFileSync(
  resolve(here, '../THIRD-PARTY-NOTICES.txt'),
  `${header}${parts.join('\n\n')}\n`,
  'utf8',
);
console.log(`${parts.length} components → THIRD-PARTY-NOTICES.txt`);
