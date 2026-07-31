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
        if (formatted === document.getText()) return [];

        const whole = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        );
        return [vscode.TextEdit.replace(whole, formatted)];
      },
    }),
  );
}
