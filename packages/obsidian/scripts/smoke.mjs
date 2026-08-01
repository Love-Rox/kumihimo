/**
 * Load the built plugin against a stand-in for Obsidian, and see what it puts on the page.
 *
 * The plugin cannot be run inside Obsidian from here, so the parts that can be checked are
 * checked: that it registers for both fences, that a block becomes a drawing, that a faulty
 * block says why, that a block torn down mid-compile writes nothing afterwards, and that the
 * schedules under it are the compiler's own.
 *
 * `Module._load` is Node's own name for the hook that lets `require('obsidian')` resolve to
 * something in this file rather than to a package that only exists inside the app.
 */

import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── a stand-in for the app ──────────────────────────────────────────────────

const registered = new Map();
const children = [];

class MarkdownRenderChild {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }
  onload() {}
  onunload() {}
}

class Plugin {
  constructor(app) {
    this.app = app;
  }
  registerMarkdownCodeBlockProcessor(fence, handler) {
    registered.set(fence, handler);
  }
  addSettingTab() {}
  async loadData() {
    return {};
  }
  async saveData() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}

class Setting {
  constructor() {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addDropdown() {
    return this;
  }
  addToggle() {
    return this;
  }
}

/** The app's sanitiser. Real enough to prove the SVG reaches the page as elements. */
function sanitizeHTMLToDom(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const script of template.content.querySelectorAll('script')) script.remove();
  return template.content;
}

const load = Module._load;
Module._load = (request, parent, isMain) =>
  request === 'obsidian'
    ? { MarkdownRenderChild, Plugin, PluginSettingTab, Setting, sanitizeHTMLToDom }
    : load(request, parent, isMain);

// ── a DOM, with the helpers Obsidian adds to Element ────────────────────────

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

const proto = dom.window.Element.prototype;
proto.empty = function () {
  while (this.firstChild) this.removeChild(this.firstChild);
};
proto.createEl = function (tag, options = {}) {
  const el = document.createElement(tag);
  if (options.cls) el.className = options.cls;
  if (options.text !== undefined) el.textContent = options.text;
  this.appendChild(el);
  return el;
};
proto.createDiv = function (options) {
  return this.createEl('div', options);
};
proto.createSpan = function (options) {
  return this.createEl('span', options);
};
proto.addClass = function (name) {
  this.classList.add(name);
};

// ── run it ──────────────────────────────────────────────────────────────────

const plugin = new (
  require(resolve(here, '../dist/main.js')).default ?? require(resolve(here, '../dist/main.js'))
)({
  workspace: { getLeavesOfType: () => [] },
});
await plugin.onload();

console.log(`登録されたブロック: ${[...registered.keys()].join(' / ')}`);
for (const fence of ['kumihimo', 'khm']) {
  if (!registered.has(fence)) throw new Error(`\`\`\`${fence} が登録されていません`);
}
console.log('  ○ kumihimo と khm の両方');

/** Render one block and wait for the compile behind it. */
async function render(source, { unloadImmediately = false } = {}) {
  const element = document.createElement('div');
  const context = {
    addChild: (child) => {
      children.push(child);
      child.onload();
      if (unloadImmediately) child.onunload();
    },
  };
  registered.get('kumihimo')(source, element, context);
  await new Promise((r) => setTimeout(r, 600));
  return element;
}

const GOOD = [
  'device cam "カメラ" as camera { out SDI : sdi }',
  'device sw "スイッチャー" as switcher { in 1..4 : sdi  out PGM : sdi }',
  'device rec "レコーダー" as recorder { in SDI : sdi }',
  'cam.SDI -> sw.1 : sdi 30m "V-01"',
  'sw.PGM -> rec.SDI : sdi 2m "V-10"',
].join('\n');

console.log('\n描画:');

const drawn = await render(GOOD);
const svg = drawn.querySelector('.kumihimo-diagram svg');
console.log(`  ${svg ? '○' : '×'} 図が SVG として入る`);
if (!svg) throw new Error(`図が描かれていません: ${drawn.innerHTML.slice(0, 200)}`);

const boxes = drawn.querySelectorAll('.kumihimo-diagram rect').length;
console.log(`  ${boxes >= 3 ? '○' : '×'} 機材の箱が ${boxes} 個`);
if (boxes < 3) throw new Error('機材が描かれていません');

const clean = drawn.querySelector('.kumihimo-diagnostics') === null;
console.log(`  ${clean ? '○' : '×'} 問題のない図に診断は出ない`);
if (!clean) throw new Error('診断のない図に診断が出ています');

console.log('\n表:');
const sheets = [...drawn.querySelectorAll('.kumihimo-schedule')];
const titles = sheets.map((s) => s.querySelector('summary')?.textContent ?? '');
console.log(`  ${sheets.length > 0 ? '○' : '×'} ${titles.join('  ')}`);
if (sheets.length === 0) throw new Error('表が出ていません');

const cableRows = sheets[0]?.querySelectorAll('tbody tr').length ?? 0;
console.log(`  ${cableRows === 2 ? '○' : '×'} ケーブル表 ${cableRows} 行`);
if (cableRows !== 2) throw new Error(`ケーブル表が 2 行のはずが ${cableRows} 行`);

const firstCells = [...(sheets[0]?.querySelectorAll('tbody tr td') ?? [])].map((td) =>
  td.textContent.trim(),
);
console.log(`  ○ 1行目: ${firstCells.slice(0, 4).join(' | ')}`);
if (!firstCells.includes('V-01')) throw new Error('ケーブル番号が出ていません');

// Every empty column is dropped, so no row should be all dashes.
const allDashes = [...(sheets[0]?.querySelectorAll('tbody tr') ?? [])].some((tr) =>
  [...tr.querySelectorAll('td')].every((td) => td.textContent.trim() === '—'),
);
console.log(`  ${allDashes ? '×' : '○'} 空だけの行がない`);
if (allDashes) throw new Error('空の列が残っています');

console.log('\n問題のある図:');
const faulty = await render(
  [
    'device ext "HDBaseT受信器" as interface { out CAT : hdbaset }',
    'device sw "L2スイッチ" as router { in 1 : lan }',
    'ext.CAT -> sw.1 : hdbaset 20m "N-01"',
  ].join('\n'),
);
const reported = faulty.querySelectorAll('.kumihimo-diagnostics li').length;
const message = faulty.querySelector('.kumihimo-diagnostics li')?.textContent ?? '';
console.log(`  ${reported > 0 ? '○' : '×'} ${reported} 件: ${message.slice(0, 70)}`);
if (reported === 0) throw new Error('挿さらない結線に診断が出ていません');
console.log(`  ${faulty.querySelector('svg') ? '○' : '×'} 診断が出ても図は描かれる`);
if (!faulty.querySelector('svg')) throw new Error('診断があると図が消えています');

console.log('\n途中で閉じられた場合:');
// The failure this guards: a note closed while a block is still compiling. The promise
// resolves afterwards and would write into an element nobody is looking at any more.
const abandoned = await render(GOOD, { unloadImmediately: true });
const wrote = abandoned.childElementCount;
console.log(`  ${wrote === 0 ? '○' : '×'} 閉じられた要素には書き込まない（子要素 ${wrote} 個）`);
if (wrote !== 0) throw new Error('破棄済みの要素に書き込んでいます');

console.log('\nスモークテスト成功');
