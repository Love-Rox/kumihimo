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
      // Markdown as well as `.khm`. A fenced block is a kumihimo diagram that VS Code calls
      // Markdown, and a provider bound to the language id never sees it — the names were
      // offered while writing a diagram in a file and withheld while writing the same
      // diagram in a note about it.
      [{ language: 'kumihimo' }, { language: 'markdown' }],
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

/** Fences that open a diagram, the same two the preview draws. */
const FENCES = /^\s*(?:```+|~~~+)\s*(kumihimo|khm)\b/;

/** Any fence at all, so the one that closes ours is recognised as closing it. */
const FENCE = /^\s*(?:```+|~~~+)/;

/**
 * Whether the cursor is inside a kumihimo block.
 *
 * Counted from the top of the file rather than searched backwards, because a fence only
 * means anything in sequence: ```` ```khm ```` inside a ```` ```md ```` example is a line of
 * prose, and the only way to know is to have read what came before it.
 *
 * @param document - The Markdown file.
 * @param position - Where the cursor is.
 * @returns Whether suggestions belong here.
 */
function insideDiagram(document: vscode.TextDocument, position: vscode.Position): boolean {
  let open = false;
  for (let line = 0; line < position.line; line += 1) {
    const text = document.lineAt(line).text;
    if (!FENCE.test(text)) continue;
    open = open ? false : FENCES.test(text);
  }
  return open;
}

function complete(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.CompletionItem[] {
  if (document.languageId === 'markdown' && !insideDiagram(document, position)) return [];

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
      described('LR', vscode.l10n.t('left to right'), vscode.CompletionItemKind.EnumMember),
      described('TB', vscode.l10n.t('top to bottom'), vscode.CompletionItemKind.EnumMember),
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
      described('in', vscode.l10n.t('input port'), vscode.CompletionItemKind.Keyword),
      described('out', vscode.l10n.t('output port'), vscode.CompletionItemKind.Keyword),
      described('io', vscode.l10n.t('bidirectional port'), vscode.CompletionItemKind.Keyword),
      described(
        'gap',
        vscode.l10n.t('space above what follows'),
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
        vscode.l10n.t('Connectors: {0}', signal.connectors.join(', ')),
      );
    } else if (signal.wireless) {
      entry.documentation = new vscode.MarkdownString(
        vscode.l10n.t('Wireless — carries a frequency where a cable carries a length'),
      );
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
    described('diagram', vscode.l10n.t('document settings'), vscode.CompletionItemKind.Keyword),
    described('device', vscode.l10n.t('a piece of equipment'), vscode.CompletionItemKind.Keyword),
    described(
      'adapter',
      vscode.l10n.t('a passive part: a splitter, a converting lead'),
      vscode.CompletionItemKind.Keyword,
    ),
    described('group', vscode.l10n.t('a frame around devices'), vscode.CompletionItemKind.Keyword),
    described('model', vscode.l10n.t('reusable equipment'), vscode.CompletionItemKind.Keyword),
    described(
      'signal',
      vscode.l10n.t('a signal type of your own'),
      vscode.CompletionItemKind.Keyword,
    ),
    described(
      'compat',
      vscode.l10n.t('override a compatibility rule'),
      vscode.CompletionItemKind.Keyword,
    ),
    described('use', vscode.l10n.t('import a library'), vscode.CompletionItemKind.Keyword),
    described('via', vscode.l10n.t('adapter in the run'), vscode.CompletionItemKind.Keyword),
    described(
      'over',
      vscode.l10n.t('what this signal is riding on'),
      vscode.CompletionItemKind.Keyword,
    ),
    described(
      'm',
      vscode.l10n.t('Length units: {0}', LENGTH_UNITS.join(' ')),
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
