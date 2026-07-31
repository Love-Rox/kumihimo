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
if (/<script/i.test(rendered)) throw new Error('プレビューにスクリプトが入っています');
console.log('  ○ スクリプトなしで切り替わる（radio + CSS）');

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
