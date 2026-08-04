/**
 * Run the command the way Markdown Preview Enhanced runs it.
 *
 * MPE is not VS Code's Markdown preview and reads none of the extension's contributions, so
 * the only way a diagram reaches it is the one MPE offers everybody: a code chunk that runs
 * a command. This checks the command is still usable that way.
 *
 * Reproduced from what MPE actually does, read out of its bundle rather than guessed:
 *
 *   await writeFile(temp, chunk)
 *   args = args.map(a => a === '$input_file' ? temp : a)
 *   if (no $input_file && !stdin) args.push(temp)
 *   const c = spawn(cmd, args, { cwd: documentDirectory })
 *   if (stdin) c.stdin.write(chunk)
 *   c.stdin.end()
 *   // stdout AND stderr are concatenated into one string, which becomes the output
 *
 * That last line is the one that matters: anything on stderr lands in the page beside the
 * drawing. `--quiet` exists for it.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../dist/cli.js');

const failures = [];

/**
 * Assert, collecting rather than throwing.
 *
 * @param what - What is being claimed, printed either way.
 * @param ok - Whether it held.
 */
function check(what, ok) {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}

/**
 * Run a chunk the way MPE would.
 *
 * @param chunk - What the author wrote inside the fence.
 * @param args - The `args` from the fence, minus the command itself.
 * @param cwd - Directory the document lives in.
 * @returns stdout and stderr, concatenated, as MPE concatenates them.
 */
async function runChunk(chunk, args, cwd) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    child.stdin.write(chunk);
    child.stdin.end();
    const chunks = [];
    child.stdout.on('data', (b) => chunks.push(b));
    child.stderr.on('data', (b) => chunks.push(b));
    child.on('close', () => done(Buffer.concat(chunks).toString()));
  });
}

const SHOW = [
  'device cam "SONY FX3"  as camera   { out SDI : sdi }',
  'device sw  "ATEM Mini" as switcher { in 1 : sdi }',
  'cam.SDI -> sw.1 : sdi 30m "V-01"',
].join('\n');

const dir = await mkdtemp(join(tmpdir(), 'kumihimo-mpe-'));

{
  const out = await runChunk(SHOW, ['-', '--stdout', '--quiet'], dir);
  // Inserted into the page as HTML, so it has to be a drawing and only a drawing.
  check('the output is an SVG and nothing else', out.trimStart().startsWith('<svg'));
  check('and it ends there', out.trimEnd().endsWith('</svg>'));
  check('the drawing carries the labels', out.includes('SONY FX3'));
}

{
  // Without `--quiet` the report joins it, because MPE concatenates the two streams. Worth
  // asserting: it is the whole reason the flag is in the documented incantation.
  const out = await runChunk(SHOW, ['-', '--stdout'], dir);
  check('without --quiet the report comes too', !out.trimEnd().endsWith('</svg>'));
}

{
  // A faulty diagram still draws. A preview that goes blank because a cable is wrong is
  // worse than one that shows the wrong cable.
  const broken = ['device a "A" as generic { out CAT : hdbaset }', 'a.CAT -> b.1'].join('\n');
  const out = await runChunk(broken, ['-', '--stdout', '--quiet'], dir);
  check('a faulty diagram still draws', out.trimStart().startsWith('<svg'));
}

await rm(dir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n${failures.length} 件失敗しました`);
  process.exitCode = 1;
} else {
  console.log('\nMPE のコードチャンク: 問題ありません');
}
