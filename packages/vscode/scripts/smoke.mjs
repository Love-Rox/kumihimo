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
import Module from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const published = [];
const commands = new Map();
const listeners = { open: [], change: [], save: [], close: [], config: [], theme: [] };

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
  languages: {
    createDiagnosticCollection: () => ({
      set: (uri, list) => published.push({ uri: uri.toString(), list }),
      delete: () => {},
      dispose: () => {},
    }),
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

console.log('\nスモークテスト成功');
Module._load = original;
