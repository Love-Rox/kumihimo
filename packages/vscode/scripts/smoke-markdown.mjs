/**
 * Run the built preview script against a fake Markdown preview.
 *
 * The extension host never loads this file — VS Code puts it in the preview's webview, which
 * is a browser. So the thing to check is not that the source compiles but that the *bundle*
 * runs in a browser: that nothing Node-only survived bundling, that the layout engine works
 * without a worker, and that a fence really does turn into a drawing.
 *
 * `happy-dom` rather than a hand-written stub. The other smoke test stubs `vscode`, which is
 * a dozen classes; a DOM is not, and a stub of one would pass by agreeing with itself.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(resolve(here, '../dist/markdown.js'), 'utf8');

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

/** A preview body with the given fenced blocks already rendered by VS Code. */
function previewOf(blocks, bodyClass = 'vscode-light', language = 'en') {
  const window = new Window({ url: 'https://file+.vscode-resource.vscode-cdn.net/' });
  // The webview inherits the editor's locale, and the script reads it from here.
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true });
  window.document.body.className = bodyClass;
  window.document.body.innerHTML = blocks
    .map(
      ([language, source]) =>
        `<pre><code class="language-${language}">${source
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</code></pre>`,
    )
    .join('\n');
  return window;
}

/** Let the script's promises settle. The layout engine is async and so is the drawing. */
async function settle(window) {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
    if (window.document.querySelector('.kumihimo svg') !== null) break;
  }
  await new Promise((r) => setTimeout(r, 50));
}

const SHOW = [
  'device cam "SONY FX3" as camera   { out SDI : sdi }',
  'device sw  "ATEM Mini" as switcher { in 1 : sdi }',
  'cam.SDI -> sw.1 : sdi 30m "V-01"',
].join('\n');

// ── a fence becomes a drawing ────────────────────────────────────────────────
{
  const window = previewOf([['kumihimo', SHOW]]);
  window.eval(bundle);
  await settle(window);

  const { document } = window;
  check('the fence is replaced', document.querySelector('pre > code.language-kumihimo') === null);
  check('a drawing is in its place', document.querySelector('.kumihimo-diagram svg') !== null);
  check('the drawing carries the labels', document.body.textContent.includes('SONY FX3'));
  check('the run number is drawn', document.body.innerHTML.includes('V-01'));
  // The one rule that matters for something injected into a webview.
  check('no script came with it', document.querySelector('.kumihimo script') === null);
  window.close();
}

// ── the other spelling ───────────────────────────────────────────────────────
{
  const window = previewOf([['khm', SHOW]]);
  window.eval(bundle);
  await settle(window);
  check('`khm` opens one too', window.document.querySelector('.kumihimo-diagram svg') !== null);
  window.close();
}

// ── a fence that is not ours is left alone ───────────────────────────────────
{
  const window = previewOf([['ts', 'const a = 1;']]);
  window.eval(bundle);
  await settle(window);
  check(
    'another language is left as code',
    window.document.querySelector('pre > code.language-ts') !== null,
  );
  window.close();
}

// ── faulty wiring still draws, and says why ──────────────────────────────────
{
  const window = previewOf([
    [
      'kumihimo',
      [
        'device ext "TX" as converter { out CAT : hdbaset }',
        'device net "SW" as router    { io 1..4 : lan }',
        'ext.CAT -> net.1',
      ].join('\n'),
    ],
  ]);
  window.eval(bundle);
  await settle(window);
  const { document } = window;
  check(
    'a faulty diagram is still drawn',
    document.querySelector('.kumihimo-diagram svg') !== null,
  );
  check(
    'and the reason is beside it',
    document.querySelector('.kumihimo-diagnostics li') !== null &&
      document.body.textContent.includes('signal-mismatch'),
  );
  window.close();
}

// ── the schedules come with it ───────────────────────────────────────────────
{
  const window = previewOf([['kumihimo', SHOW]]);
  window.eval(bundle);
  await settle(window);
  const { document } = window;
  const titles = [...document.querySelectorAll('.kumihimo summary')].map((s) => s.textContent);
  check('a schedule is folded up underneath', titles.length > 0);
  check('and it holds the run', document.body.textContent.includes('30m'));
  window.close();
}

// ── the editor's language ────────────────────────────────────────────────────
{
  const ja = previewOf([['kumihimo', SHOW]], 'vscode-light', 'ja-JP');
  ja.eval(bundle);
  await settle(ja);
  const titles = [...ja.document.querySelectorAll('.kumihimo summary')].map((s) => s.textContent);
  // A drawing in a note has no business disagreeing with the panel beside it.
  check('a Japanese editor gets Japanese headings', titles.includes('ケーブル表'));
  ja.close();

  const de = previewOf([['kumihimo', SHOW]], 'vscode-light', 'de-DE');
  de.eval(bundle);
  await settle(de);
  const fallback = [...de.document.querySelectorAll('.kumihimo summary')].map((s) => s.textContent);
  // Anything the catalogue does not carry lands on English, as it does in the command line.
  check('a language we do not carry gets English', fallback.includes('Cable schedule'));
  de.close();
}

// ── the preview's own colours ────────────────────────────────────────────────
{
  const light = previewOf([['kumihimo', SHOW]], 'vscode-light');
  light.eval(bundle);
  await settle(light);
  const dark = previewOf([['kumihimo', SHOW]], 'vscode-dark');
  dark.eval(bundle);
  await settle(dark);
  check(
    'a dark preview gets a dark drawing',
    light.document.body.innerHTML !== dark.document.body.innerHTML,
  );
  light.close();
  dark.close();
}

// ── drawn once, not once per mutation ────────────────────────────────────────
{
  const window = previewOf([['kumihimo', SHOW]]);
  window.eval(bundle);

  // Checked here, with nothing awaited in between: the script scans synchronously on load
  // and the mark goes on before the first `await`, which is the whole point of it. The
  // preview pokes the document on every keystroke, and each poke runs the observer — which
  // would find this same `<pre>`, still un-replaced because the layout has not finished, and
  // start compiling it a second time.
  //
  // The waste never shows in the DOM: the second drawing calls `replaceWith` on a `<pre>`
  // the first already detached, and that does nothing. So the mark itself is what there is
  // to assert. Counting `<svg>` would pass with the guard deleted — cover that is not there.
  check(
    'a block is claimed before it is drawn',
    window.document.querySelector('pre[data-kumihimo]') !== null,
  );

  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 5));
    window.document.body.appendChild(window.document.createElement('span'));
  }
  await settle(window);
  check(
    'and one drawing comes out',
    window.document.querySelectorAll('.kumihimo svg').length === 1,
  );
  window.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} 件失敗しました`);
  process.exitCode = 1;
} else {
  console.log('\nMarkdown プレビュー: 問題ありません');
}
