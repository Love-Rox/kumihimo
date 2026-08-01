/**
 * Run the built extension against a fake editor.
 *
 * There is no VS Code here, so `vscode` is stubbed with just enough of the API for
 * `activate()` to wire itself up. That is not a substitute for opening the real thing, but
 * it catches what unit tests on the source cannot: whether the *bundled* file loads, whether
 * elkjs survives being bundled, and whether a diagnostic comes back with a usable range.
 */

/* The stub has to have the shape of the API it stands in for: VS Code's `Diagnostic` and
   `Position` are constructed with `new`, so the doubles are classes with only constructors.
   `Module._load` is Node's own name for the hook that lets `require('vscode')` resolve to
   the stub at all. Both rules are right in general and wrong for a file impersonating
   another runtime. */
/* oxlint-disable typescript/no-extraneous-class */
/* oxlint-disable no-underscore-dangle */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const published = [];
const commands = new Map();
const completion = { provider: undefined };
const formatting = { provider: undefined };
const asked = new Set();
const listeners = {
  open: [],
  change: [],
  save: [],
  close: [],
  config: [],
  theme: [],
  viewState: [],
};

const Position = class {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
  isEqual(other) {
    return this.line === other.line && this.character === other.character;
  }
};

const vscode = {
  // The host's language. Mutated below, because the thing worth checking is not that the
  // extension reads it once but that the compiler's own sentences follow it.
  env: { language: 'en' },
  Position,
  Range: class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
  ViewColumn: { Beside: -2 },
  Uri: { parse: (s) => ({ toString: () => s }) },
  TextEdit: { replace: (range, newText) => ({ range, newText }) },
  CompletionItem: class {
    constructor(label, kind) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: {
    Keyword: 13,
    EnumMember: 19,
    Class: 6,
    Color: 15,
    Unit: 10,
  },
  MarkdownString: class {
    constructor(value) {
      this.value = value;
    }
  },
  languages: {
    createDiagnosticCollection: () => ({
      set: (uri, list) => published.push({ uri: uri.toString(), list }),
      delete: () => {},
      dispose: () => {},
    }),
    registerCompletionItemProvider: (_selector, provider) => {
      completion.provider = provider;
      return { dispose() {} };
    },
    registerDocumentFormattingEditProvider: (_selector, provider) => {
      formatting.provider = provider;
      return { dispose() {} };
    },
  },
  workspace: {
    textDocuments: [],
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    onDidOpenTextDocument: (f) => (listeners.open.push(f), { dispose() {} }),
    onDidChangeTextDocument: (f) => (listeners.change.push(f), { dispose() {} }),
    onDidSaveTextDocument: (f) => (listeners.save.push(f), { dispose() {} }),
    onDidCloseTextDocument: (f) => (listeners.close.push(f), { dispose() {} }),
    onDidChangeConfiguration: (f) => (listeners.config.push(f), { dispose() {} }),
  },
  window: {
    activeTextEditor: undefined,
    activeColorTheme: { kind: 1 },
    createWebviewPanel: () => ({
      webview: { cspSource: 'vscode-resource:', html: '' },
      onDidDispose: () => {},
      reveal: () => {},
      dispose: () => {},
      title: '',
    }),
    showInformationMessage: () => {},
    onDidChangeActiveColorTheme: (f) => (listeners.theme.push(f), { dispose() {} }),
  },
  commands: {
    registerCommand: (id, fn) => (commands.set(id, fn), { dispose() {} }),
  },
  // The host substitutes translations here. Recording the source strings instead lets the
  // test check that every one of them has a Japanese entry.
  l10n: {
    t: (message, ...args) => {
      asked.add(message);
      return args.reduce((text, value, i) => text.replaceAll(`{${i}}`, String(value)), message);
    },
  },
};

// The bundle requires 'vscode' at load; the host normally provides it.
const original = Module._load;
Module._load = (request, parent, isMain) =>
  request === 'vscode' ? vscode : original(request, parent, isMain);

const require = createRequire(import.meta.url);
const extension = require(resolve(here, '../dist/extension.cjs'));

const doc = (text) => ({
  languageId: 'kumihimo',
  uri: { toString: () => 'file:///studio.khm', path: '/studio.khm' },
  getText: () => text,
  lineAt: (n) => ({
    range: { start: new Position(n, 0), end: new Position(n, text.split('\n')[n]?.length ?? 0) },
  }),
});

const context = { subscriptions: [] };
extension.activate(context);
console.log(`activate: ${context.subscriptions.length} subscriptions, ${commands.size} command(s)`);

// A file that is wrong in a way only this compiler catches: the plug fits, nothing passes.
const faulty = doc(
  [
    'device ext   "HDBaseT受信器" as interface { out CAT : hdbaset }',
    'device netsw "L2スイッチ"     as router    { in  1   : lan }',
    '',
    'ext.CAT -> netsw.1 : hdbaset 20m "N-01"',
  ].join('\n'),
);

for (const listener of listeners.open) listener(faulty);

const latest = published.at(-1);
if (!latest) throw new Error('診断が publish されませんでした');

console.log(`\n診断 ${latest.list.length} 件:`);
for (const d of latest.list) {
  const { start, end } = d.range;
  console.log(
    `  [${d.code.value}] ${d.severity === 1 ? 'warning' : 'error'}  ` +
      `${start.line}:${start.character}-${end.line}:${end.character}  ${d.message}`,
  );
}

if (latest.list.length !== 1) throw new Error(`診断が1件のはずが ${latest.list.length} 件`);
if (latest.list[0].range.start.line !== 3) {
  throw new Error(`4行目(index 3)を指すはずが ${latest.list[0].range.start.line}`);
}

// And a clean one, to be sure the check is not simply always complaining.
const clean = doc(
  'device a as camera { out SDI : sdi }\ndevice b as recorder { in SDI : sdi }\na.SDI -> b.SDI : sdi',
);
for (const listener of listeners.open) listener(clean);
const after = published.at(-1);
if (after.list.length !== 0) throw new Error(`正しい図に診断 ${after.list.length} 件`);
console.log('\n正しい図: 診断 0 件');

// The compiler's own sentences, in the editor's language. The extension's strings go
// through vscode.l10n; the compiler's do not, and a panel that mixes the two is the thing
// this checks against.
console.log('\n診断の言語:');
const wrong = doc(
  'device a as camera { out SDI : sdi }\ndevice b as router { in 1 : lan }\na.SDI -> b.1',
);

for (const [language, expected] of [
  ['en', 'cannot be joined by a cable'],
  ['ja', '変換ケーブルでは接続できない'],
  // A region tag, which is what VS Code actually reports for most languages.
  ['ja-jp', '変換ケーブルでは接続できない'],
  // One the catalogue does not carry: English, rather than a blank or a crash.
  ['pt-br', 'cannot be joined by a cable'],
]) {
  vscode.env.language = language;
  for (const listener of listeners.open) listener(wrong);
  const message = published.at(-1).list[0]?.message ?? '';
  const ok = message.includes(expected);
  console.log(`  ${ok ? '○' : '×'} ${language.padEnd(6)} ${message.slice(0, 60)}`);
  if (!ok) throw new Error(`${language}: "${expected}" を含むはずが "${message}"`);
}
vscode.env.language = 'en';

// Completions. Not "does a list come back" — whether the right list comes back for where
// the cursor is, since a provider that offers signal types everywhere is worse than none.
const suggest = (text) => {
  const lines = text.split('\n');
  const stub = { lineAt: (n) => ({ text: lines[n] ?? '' }) };
  const position = { line: lines.length - 1, character: lines.at(-1).length };
  return completion.provider.provideCompletionItems(stub, position).map((c) => c.label);
};

const cases = [
  ['device d { in A : ', 'trs35', '型の候補'],
  ['device d { in A : xlr | ', 'trs', 'パイプの後も型'],
  ['device d "x" as ', 'mixer', 'as の後は機材種別'],
  ['a.OUT -> b.IN : sdi [color=', '青', '色の候補'],
  ['diagram { theme: ', 'blueprint', 'テーマ'],
  ['diagram { direction: ', 'TB', '方向'],
  ['device d {\n  ', 'gap', '本体の中はポート宣言'],
  ['', 'device', 'トップレベルは宣言'],
];

console.log('\n補完:');
for (const [text, expected, what] of cases) {
  const labels = suggest(text);
  const ok = labels.includes(expected);
  console.log(`  ${ok ? '○' : '×'} ${what.padEnd(18)} ${labels.length} 件 / ${expected}`);
  if (!ok) throw new Error(`${what}: ${expected} が候補にありません (${labels.slice(0, 8)})`);
}

// The point of driving it off the compiler's own exports: a type added to the language is
// offered without a second list to remember. trs35 landed this session and is here.
const afterColon = suggest('device d { in A : ');
for (const added of ['trs35', 'trrs', 'trrs35', 'usbpd']) {
  if (!afterColon.includes(added)) throw new Error(`${added} が候補にありません`);
}
console.log(`  ○ 今回追加した型も自動で出る  trs35 trrs trrs35 usbpd`);

// The preview: does it actually produce the panes, with rows in them?
const previewDoc = doc(
  [
    'device cam "カメラ" as camera   { out SDI : sdi }',
    'device sw  "ATEM"   as switcher { in 1 : sdi  out PGM : sdi }',
    'device pc  "PC"     as computer { out HDMI : hdmi }',
    'device mon "モニタ" as display  { in DVI : dvi }',
    '',
    'cam.SDI -> sw.1     : sdi 30m "V-01"',
    'pc.HDMI -> mon.DVI  : hdmi 2m "V-02" via "HDMI-DVI変換ケーブル"',
  ].join('\n'),
);

let rendered = '';
// Assigning `html` is what reloads a real webview, so counting the assignments is
// counting the cost. Under the fix, an edit that leaves the drawing identical writes
// nothing at all.
let htmlWrites = 0;
const panel = {
  visible: true,
  webview: {
    cspSource: 'vscode-resource:',
    set html(value) {
      htmlWrites += 1;
      rendered = value;
    },
    get html() {
      return rendered;
    },
  },
  onDidDispose: () => {},
  onDidChangeViewState: (f) => (listeners.viewState.push(f), { dispose() {} }),
  reveal: () => {},
  dispose: () => {},
  title: '',
};
vscode.window.createWebviewPanel = () => panel;
vscode.window.activeTextEditor = { document: previewDoc };

await commands.get('kumihimo.showPreview')();
await new Promise((r) => setTimeout(r, 800));

console.log('\nプレビュー:');
for (const [pane, expect] of [
  ['diagram', 'data:image/svg+xml'],
  ['cables', 'V-01'],
  ['equipment', 'ATEM'],
  ['adapters', 'HDMI-DVI'],
]) {
  const hasPane = rendered.includes(`data-pane="${pane}"`);
  const hasContent = rendered.includes(expect);
  console.log(`  ${hasPane && hasContent ? '○' : '×'} ${pane.padEnd(10)} ${expect}`);
  if (!hasPane) throw new Error(`${pane} のペインがありません`);
  if (!hasContent) throw new Error(`${pane} に ${expect} がありません`);
}
// This used to assert the page had no script at all. It has one now — turning the drawing
// into a PNG needs a canvas — so what is checked is the guarantee that actually mattered,
// stated more precisely than "no script".
//
// The drawing comes from a file that arrived with somebody else's repository. Inline it as
// `<svg>` and it can carry script; put the same bytes in an `<img>` and it cannot, whatever
// else the page is allowed to do.
if (/<svg[\s>]/i.test(rendered)) throw new Error('図が <img> ではなく <svg> で埋まっています');
console.log('  ○ 図は <img> の中（<svg> を直接埋めていない）');

// And the one script that does exist can only run if the CSP lets it, which means a nonce
// on both. A script tag without one is a script the browser refuses — silently.
const nonce = rendered.match(/script-src 'nonce-([A-Za-z0-9_-]+)'/)?.[1];
if (!nonce) throw new Error('CSP が nonce を指定していません');
for (const tag of rendered.match(/<script[^>]*>/gi) ?? []) {
  if (!tag.includes(`nonce="${nonce}"`)) throw new Error(`nonce のない script: ${tag}`);
}
console.log(
  `  ○ script は CSP の nonce つきのみ（${(rendered.match(/<script/gi) ?? []).length} 件）`,
);

// Tab switching still costs no script. It was radios and sibling selectors before there was
// any script on the page, and there is no reason for that to become a script's job now.
if (!/input\[name="pane"\]/.test(rendered)) throw new Error('タブが radio ではなくなっています');
console.log('  ○ タブ切り替えは今もスクリプト不要（radio + CSS）');

// The freeze this guards: every keystroke used to reload the whole webview — the document
// torn down, the markup parsed again, a base64 data URI of the entire drawing decoded
// again. For a job-sized diagram that is 130 kB, four times a second.
console.log('\nプレビューの再描画:');

const settled = async () => {
  await new Promise((r) => setTimeout(r, 900));
};

htmlWrites = 0;
for (let i = 0; i < 8; i += 1) {
  for (const listener of listeners.change) listener({ document: previewDoc });
}
await settled();
const afterIdenticalEdits = htmlWrites;
console.log(
  `  ${afterIdenticalEdits <= 1 ? '○' : '×'} 同じ内容の編集 8 回 → 書き込み ${afterIdenticalEdits} 回`,
);
if (afterIdenticalEdits > 1) {
  throw new Error(`図が変わらない編集で ${afterIdenticalEdits} 回も webview を作り直しています`);
}

// A real change must still land, or the debounce has simply broken the preview.
const changedDoc = doc(
  [
    'device cam "カメラ" as camera { out SDI : sdi }',
    'device rec as recorder { in SDI : sdi }',
    'cam.SDI -> rec.SDI',
  ].join('\n'),
);
vscode.window.activeTextEditor = { document: changedDoc };
htmlWrites = 0;
await commands.get('kumihimo.showPreview')();
await settled();
console.log(
  `  ${htmlWrites >= 1 ? '○' : '×'} 内容が変わったら描き直す → 書き込み ${htmlWrites} 回`,
);
if (htmlWrites < 1) throw new Error('内容が変わったのに描き直していません');

// A panel nobody is looking at should not be drawn into at all — and the edit it missed
// has to be a real one, or there would be nothing to catch up on either way.
const whileHidden = doc(
  [
    'device cam "カメラ" as camera { out SDI : sdi }',
    'device mon as display { in SDI : sdi }',
    'cam.SDI -> mon.SDI',
  ].join('\n'),
);
panel.visible = false;
htmlWrites = 0;
for (const listener of listeners.change) listener({ document: whileHidden });
await settled();
console.log(
  `  ${htmlWrites === 0 ? '○' : '×'} 隠れているタブには描かない → 書き込み ${htmlWrites} 回`,
);
if (htmlWrites !== 0) throw new Error('見えていないタブに描き込んでいます');

// …and should catch up when it comes back.
panel.visible = true;
for (const listener of listeners.viewState) listener();
await settled();
console.log(`  ${htmlWrites >= 1 ? '○' : '×'} 戻ってきたら追いつく → 書き込み ${htmlWrites} 回`);
if (htmlWrites < 1) throw new Error('タブに戻っても描き直していません');
// The formatter. Before it existed, `.khm` was a language the editor offered to format and
// then could not — which sends someone to the Marketplace to look for one that is not there.
console.log('\n整形:');

const messy = 'device sw "ATEM" as switcher {\nin 1..4:sdi\nout PGM:sdi\n}';
const formatDoc = {
  ...doc(messy),
  positionAt: (offset) => new Position(0, offset),
};

const edits = formatting.provider.provideDocumentFormattingEdits(formatDoc, { tabSize: 2 });
const text = edits[0]?.newText ?? '';
const lines = text.split('\n');

console.log(`  ${edits.length === 1 ? '○' : '×'} 編集を1件返す`);
if (edits.length !== 1) throw new Error(`編集が1件のはずが ${edits.length} 件`);

const ports = lines.filter((l) => /^ {2}(in|out) /.test(l));
const aligned = new Set(ports.map((l) => l.indexOf(':'))).size === 1;
console.log(`  ${aligned ? '○' : '×'} 桁が揃う  ${JSON.stringify(ports)}`);
if (!aligned) throw new Error('桁が揃っていません');

// Formatting something already formatted must produce no edit at all: an edit that
// replaces the document with itself still moves the cursor and dirties the file.
const tidy = { ...doc(text), positionAt: (offset) => new Position(0, offset) };
const again = formatting.provider.provideDocumentFormattingEdits(tidy, { tabSize: 2 });
console.log(`  ${again.length === 0 ? '○' : '×'} 整形済みなら編集を返さない`);
if (again.length !== 0) throw new Error('整形済みの文書に編集を返しています');

// The snippets. What makes one worth having is that the skeleton it inserts is correct,
// so the words baked into them are checked against the compiler's own lists.
console.log('\nスニペット:');

const snippets = JSON.parse(readFileSync(resolve(here, '../snippets/kumihimo.json'), 'utf8'));
const entries = Object.entries(snippets);

const contributed = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')).contributes
  .snippets;
if (!contributed?.some((c) => c.language === 'kumihimo')) {
  throw new Error('マニフェストにスニペットが登録されていません');
}
console.log(`  ○ マニフェストに登録されている  ${entries.length} 件`);

for (const [name, snippet] of entries) {
  if (!snippet.prefix || !snippet.body || !snippet.description) {
    throw new Error(`${name}: prefix / body / description が揃っていません`);
  }
}
console.log('  ○ すべてに prefix と説明がある');

const core = await import('@love-rox/kumihimo-core');
const known = new Set([
  ...Object.keys(core.BUILTIN_SIGNALS),
  ...core.DEVICE_KINDS,
  ...Object.keys(core.THEMES),
  ...core.LENGTH_UNITS,
  'LR',
  'TB',
  'in',
  'out',
  'io',
  'video',
  'audio',
  'control',
  'network',
  'power',
  'sync',
  'generic',
  'ok',
  'lossy',
  'incompatible',
]);

// The words offered inside a ${1|a,b,c|} choice have to be words the compiler accepts.
const snippetText = JSON.stringify(snippets);
const choices = [...snippetText.matchAll(/\$\{\d+\|([^|]+)\|\}/g)].map((m) => m[1].split(','));
const offered = choices.flat();
const unknown = offered.filter((w) => !known.has(w));
console.log(`  ${unknown.length === 0 ? '○' : '×'} 選択肢 ${offered.length} 語がコンパイラの語彙`);
if (unknown.length > 0) throw new Error(`コンパイラが知らない語: ${unknown.join(' ')}`);

// And each skeleton has to parse once its placeholders are filled with their defaults.
const fill = (body) =>
  (Array.isArray(body) ? body.join('\n') : body)
    // The first choice, the default of a placeholder, and a bare tab stop.
    .replace(/\$\{\d+\|([^|,]+)[^|]*\|\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{?\d+\}?/g, '')
    .replace(/\t/g, '  ');

// A few snippets are statements that only exist inside a device body, and are named here
// rather than detected: a snippet that stops parsing on its own should fail this check,
// not be quietly wrapped until it passes.
const bodyOnly = new Set(['gap']);

for (const [name, snippet] of entries) {
  const filled = fill(snippet.body);
  const source = bodyOnly.has(name) ? `device d as generic {\n${filled}\nin X : sdi\n}` : filled;
  const errors = core.parse(source).diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`${name} が構文として通りません: ${errors[0].message}\n${source}`);
  }
}
console.log(`  ○ 既定値を埋めた形がすべて構文として通る（うち ${bodyOnly.size} 件は本体の中で）`);

// Every source string the code asked for must have a Japanese entry. A half-translated UI
// is the failure this replaced: strings that fall back to English do so silently.
const ja = JSON.parse(readFileSync(resolve(here, '../l10n/bundle.l10n.ja.json'), 'utf8'));
const untranslated = [...asked].filter((key) => !(key in ja));

console.log(`\n多言語対応: ${asked.size} 文字列を要求、日本語訳 ${Object.keys(ja).length} 件`);
if (untranslated.length > 0) {
  throw new Error(`日本語訳のない文字列: ${untranslated.join(' / ')}`);
}
console.log('  ○ すべてに日本語訳がある');

// The manifest's user-visible strings must resolve too, in both bundles.
const manifest = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));
const keys = JSON.stringify(manifest).match(/%[\w.]+%/g) ?? [];
for (const bundle of ['package.nls.json', 'package.nls.ja.json']) {
  const table = JSON.parse(readFileSync(resolve(here, `../${bundle}`), 'utf8'));
  const missing = [...new Set(keys)].filter((k) => !(k.slice(1, -1) in table));
  if (missing.length > 0) throw new Error(`${bundle} に ${missing.join(' ')} がありません`);
}
console.log(`  ○ マニフェストの ${new Set(keys).size} キーが両方の bundle にある`);

console.log('\nスモークテスト成功');
Module._load = original;
