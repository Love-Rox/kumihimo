import { formatSource } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

/**
 * Lay a `.khm` file out on demand.
 *
 * Registered as a document formatter rather than a command, so it arrives through the
 * editor's own route: Format Document, format on save, and the keybinding people already
 * know. Before this, `.khm` was a language the editor offered to format and then could
 * not, which sends someone to the Marketplace to look for a formatter that does not exist.
 */
export function registerFormatting(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('kumihimo', {
      provideDocumentFormattingEdits(document, options) {
        const settings = vscode.workspace.getConfiguration('kumihimo');
        const formatted = formatSource(document.getText(), {
          // The editor's own tab width, so a file matches the rest of the project rather
          // than a number this extension picked.
          indent: options.tabSize,
          align: settings.get<boolean>('format.align', true),
        });

        // Nothing to do is better said with no edit at all: an edit that replaces the
        // document with itself still moves the cursor and dirties the file.
        const original = document.getText();
        if (formatted === original) return [];

        return [minimalEdit(document, original, formatted)];
      },
    }),
  );
}

/**
 * One edit covering only the lines that actually changed.
 *
 * Replacing the whole document is a line of code and a bad idea. The editor invalidates
 * everything and re-tokenises it, folds collapse, and the change event that comes back out
 * sets this extension's own diagnostics and preview redrawing again — on save, when several
 * things are already competing for the same moment. Aligning one block in a long file
 * should cost that block.
 *
 * Line-based because the formatter is: it lays out whole lines, so the first and last lines
 * that differ bound everything it did.
 *
 * @param document - The document being formatted.
 * @param original - Its current text.
 * @param formatted - What it should say.
 * @returns An edit spanning the changed lines and nothing else.
 */
function minimalEdit(
  document: vscode.TextDocument,
  original: string,
  formatted: string,
): vscode.TextEdit {
  const before = original.split('\n');
  const after = formatted.split('\n');

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let fromEnd = 0;
  while (
    fromEnd < before.length - start &&
    fromEnd < after.length - start &&
    before[before.length - 1 - fromEnd] === after[after.length - 1 - fromEnd]
  ) {
    fromEnd += 1;
  }

  const lastBefore = before.length - fromEnd;
  const range = new vscode.Range(
    new vscode.Position(start, 0),
    // The end of the last changed line, not the start of the next: taking the newline with
    // it would delete a line the formatter did not touch when the change reaches the end.
    new vscode.Position(lastBefore - 1, before[lastBefore - 1]?.length ?? 0),
  );
  return vscode.TextEdit.replace(range, after.slice(start, after.length - fromEnd).join('\n'));
}
