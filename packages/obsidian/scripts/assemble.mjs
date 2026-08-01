/**
 * Assemble the plugin repository that Obsidian's directory reads.
 *
 * This was shell inside the workflow, and three releases failed in a row on it — a token
 * that could not write a workflow file, a `packageManager` field that lives on the monorepo
 * root, and an apostrophe inside a single-quoted `node -e` that ended the script mid-word.
 * None of them were visible by reading it, and none of them could be run without cutting a
 * release.
 *
 * As a script it runs anywhere, including in CI on every commit, which is the difference
 * between glue that is checked and glue that is hoped about.
 *
 * The directory takes a repository URL and reads `manifest.json` from the root of its
 * default branch, so the monorepo cannot answer it directly. What goes across is not only
 * the bundle: closed source is not accepted, and it should not be — what somebody installs
 * is 1.5 MB of minified JavaScript, and the source has to be beside it to be read first.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(here, '../../..');

/**
 * Build the folder.
 *
 * @param out - Where to put it. Emptied first.
 * @returns The version assembled, which is the tag the release has to carry.
 */
export async function assemble(out) {
  const pkg = JSON.parse(await readFile(resolve(pkgRoot, 'package.json'), 'utf8'));
  const root = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
  const core = JSON.parse(await readFile(resolve(repoRoot, 'packages/core/package.json'), 'utf8'));

  await rm(out, { recursive: true, force: true });
  await mkdir(resolve(out, 'src'), { recursive: true });
  await mkdir(resolve(out, 'scripts'), { recursive: true });
  await mkdir(resolve(out, '.github/workflows'), { recursive: true });

  // What the directory reads, and what somebody installing by hand copies.
  for (const [from, to] of [
    ['dist/main.js', 'main.js'],
    ['manifest.json', 'manifest.json'],
    ['styles.css', 'styles.css'],
    ['README.md', 'README.md'],
    ['LICENSE', 'LICENSE'],
    ['src/main.ts', 'src/main.ts'],
    ['src/settings.ts', 'src/settings.ts'],
    ['scripts/build.mjs', 'scripts/build.mjs'],
    ['scripts/smoke.mjs', 'scripts/smoke.mjs'],
  ]) {
    await cp(resolve(pkgRoot, from), resolve(out, to));
  }

  // The mirror builds and signs its own release. `attest-build-provenance` records against
  // whichever repository runs it, so attesting from the monorepo put the provenance where
  // nobody checking the plugin would look for it.
  await cp(
    resolve(repoRoot, '.github/workflows/mirror-release.yml'),
    resolve(out, '.github/workflows/release.yml'),
  );

  // The package tsconfig extends `../../tsconfig.base.json`, a path that means nothing once
  // the package is the whole repository.
  await cp(resolve(repoRoot, 'tsconfig.base.json'), resolve(out, 'tsconfig.base.json'));
  const tsconfig = await readFile(resolve(pkgRoot, 'tsconfig.json'), 'utf8');
  await writeFile(
    resolve(out, 'tsconfig.json'),
    tsconfig.replace('../../tsconfig.base.json', './tsconfig.base.json'),
    'utf8',
  );

  await writeFile(
    resolve(out, 'package.json'),
    `${JSON.stringify(
      {
        name: 'obsidian-kumihimo',
        version: pkg.version,
        description: pkg.description,
        license: 'MIT',
        private: true,
        // `pnpm/action-setup` refuses to guess a version, and there is no monorepo root
        // here for it to read one from.
        packageManager: root.packageManager,
        // Stated rather than copied. This repository's `test` also checks that the mirror
        // can be assembled, which is a question about this repository and not about the
        // mirror — and `assemble.mjs` is deliberately not shipped, so copying the line
        // would have sent a `test` that cannot run.
        scripts: {
          build: 'node scripts/build.mjs',
          test: 'pnpm build && node scripts/smoke.mjs',
          typecheck: 'tsc --noEmit',
        },
        // Exact, not a range. A caret means somebody building this next year gets a
        // different compiler than the release was built with, and then the bundle they
        // produce is not the bundle that was attested.
        dependencies: { '@love-rox/kumihimo-core': core.version },
        // TypeScript and the Node types come from the monorepo root, so they have to be
        // named here: a repository that says it can be built has to be buildable.
        devDependencies: {
          ...pkg.devDependencies,
          typescript: root.devDependencies.typescript,
          '@types/node': root.devDependencies['@types/node'],
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeFile(resolve(out, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');

  await writeFile(
    resolve(out, 'CONTRIBUTING.md'),
    `# Contributing

This repository is generated, and everything in it is built from
[Love-Rox/kumihimo](https://github.com/Love-Rox/kumihimo) under \`packages/obsidian\` — where
the plugin lives beside the compiler it uses. It is mirrored here because Obsidian's
community directory reads \`manifest.json\` from the root of a repository, which a monorepo
cannot offer.

The source is here and it builds:

\`\`\`sh
pnpm install
pnpm build
\`\`\`

That produces the \`main.js\` attached to the matching release, from the compiler version
pinned in \`package.json\`.

Open issues and pull requests against the monorepo. Changes made here are overwritten by
the next release.
`,
    'utf8',
  );

  // The build syncs the manifest from package.json. If that ever stops happening, Obsidian
  // looks for a release tag that does not exist and the plugin simply fails to install.
  const manifest = JSON.parse(await readFile(resolve(out, 'manifest.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest.json は ${manifest.version}、package.json は ${pkg.version}`);
  }

  return pkg.version;
}

// Run directly: `node scripts/assemble.mjs <out>`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? resolve(repoRoot, 'mirror'));
  const version = await assemble(out);
  console.log(`${out} に ${version} を組み立てました`);
}
