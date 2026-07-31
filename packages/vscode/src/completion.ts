import {
  BUILTIN_SIGNALS,
  CABLE_COLORS,
  DEVICE_KINDS,
  LENGTH_UNITS,
  THEMES,
} from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

/**
 * Suggestions, taken from the compiler rather than from a list kept beside it.
 *
 * Every name offered here is one the compiler will accept, because both read the same
 * exports. A signal type added to the language shows up in the editor with no second place
 * to remember, and no way for the two to disagree.
 */
export function registerCompletion(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'kumihimo' },
      { provideCompletionItems: complete },
      // Where a name is expected, the character before it says which names.
      ':',
      '|',
      '=',
      '@',
      '.',
    ),
  );
}

/** The text of the current line up to the cursor. */
function before(document: vscode.TextDocument, position: vscode.Position): string {
  return document.lineAt(position.line).text.slice(0, position.character);
}

function complete(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.CompletionItem[] {
  const line = before(document, position);

  // `[color=` and `[…, color=` — jacket colours, before the general attribute case.
  if (/\bcolor\s*=\s*[^,\]]*$/.test(line)) return colours();

  // `theme:` inside a diagram block.
  if (/\btheme\s*:\s*\w*$/.test(line)) {
    return Object.keys(THEMES).map((name) => item(name, vscode.CompletionItemKind.Color));
  }

  // `direction:` — two values, and no reason to make anyone remember which.
  if (/\bdirection\s*:\s*\w*$/.test(line)) {
    return [
      described('LR', '左から右 / left to right', vscode.CompletionItemKind.EnumMember),
      described('TB', '上から下 / top to bottom', vscode.CompletionItemKind.EnumMember),
    ];
  }

  // `as ` — the shape the device is drawn with.
  if (/\bas\s+\w*$/.test(line)) {
    return DEVICE_KINDS.map((kind) => item(kind, vscode.CompletionItemKind.Class));
  }

  // After a colon or a pipe: a signal type. The pipe case is a connector that takes more
  // than one plug, and it wants exactly the same list.
  if (/[:|]\s*\w*$/.test(line)) return signals();

  // Inside a device or model body.
  if (insideBody(document, position)) {
    return [
      described('in', '入力ポート / input port', vscode.CompletionItemKind.Keyword),
      described('out', '出力ポート / output port', vscode.CompletionItemKind.Keyword),
      described('io', '双方向ポート / bidirectional port', vscode.CompletionItemKind.Keyword),
      described(
        'gap',
        '次の宣言の上に余白 / space above what follows',
        vscode.CompletionItemKind.Keyword,
      ),
    ];
  }

  return topLevel();
}

/**
 * Whether the cursor sits inside a `{ … }` body.
 *
 * Counted by brace, not parsed: the file being typed into is usually not valid yet, and a
 * suggestion list that waits for a parseable document is a suggestion list nobody sees.
 */
function insideBody(document: vscode.TextDocument, position: vscode.Position): boolean {
  let depth = 0;
  for (let line = 0; line <= position.line; line += 1) {
    const text = line === position.line ? before(document, position) : document.lineAt(line).text;
    for (const ch of text.replace(/#.*$/, '')) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
  }
  return depth > 0;
}

function signals(): vscode.CompletionItem[] {
  return Object.values(BUILTIN_SIGNALS).map((signal) => {
    const entry = new vscode.CompletionItem(signal.name, vscode.CompletionItemKind.EnumMember);
    entry.detail = `${signal.label} · ${signal.category}`;
    // The connectors are the reason to pick one name over another: `trs` and `trs35` are
    // told apart by the barrel, and that is what belongs in front of someone choosing.
    if (signal.connectors.length > 0) {
      entry.documentation = new vscode.MarkdownString(
        `コネクタ / connectors: ${signal.connectors.join(', ')}`,
      );
    } else if (signal.wireless) {
      entry.documentation = new vscode.MarkdownString('無線 / wireless — 長さではなく周波数');
    }
    // Group by category so audio does not interleave with video in the list.
    entry.sortText = `${signal.category}:${signal.name}`;
    return entry;
  });
}

function colours(): vscode.CompletionItem[] {
  return Object.entries(CABLE_COLORS).map(([name, hex]) => {
    const entry = new vscode.CompletionItem(name, vscode.CompletionItemKind.Color);
    entry.detail = hex;
    return entry;
  });
}

function topLevel(): vscode.CompletionItem[] {
  return [
    described('diagram', '図全体の設定 / document settings', vscode.CompletionItemKind.Keyword),
    described('device', '機材 / a piece of equipment', vscode.CompletionItemKind.Keyword),
    described('group', 'まとまり / a frame around devices', vscode.CompletionItemKind.Keyword),
    described('model', '機材の定義 / reusable equipment', vscode.CompletionItemKind.Keyword),
    described(
      'signal',
      '独自の信号種別 / a signal type of your own',
      vscode.CompletionItemKind.Keyword,
    ),
    described(
      'compat',
      '互換規則の上書き / override a compatibility rule',
      vscode.CompletionItemKind.Keyword,
    ),
    described('use', 'ライブラリの読み込み / import a library', vscode.CompletionItemKind.Keyword),
    described('via', `変換部材 / adapter in the run`, vscode.CompletionItemKind.Keyword),
    described(
      'm',
      `ケーブル長の単位 / length units: ${LENGTH_UNITS.join(' ')}`,
      vscode.CompletionItemKind.Unit,
    ),
  ];
}

function item(label: string, kind: vscode.CompletionItemKind): vscode.CompletionItem {
  return new vscode.CompletionItem(label, kind);
}

function described(
  label: string,
  detail: string,
  kind: vscode.CompletionItemKind,
): vscode.CompletionItem {
  const entry = new vscode.CompletionItem(label, kind);
  entry.detail = detail;
  return entry;
}
