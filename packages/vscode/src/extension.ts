import * as vscode from 'vscode';

import { checkDocument } from './diagnostics.js';
import { Preview } from './preview.js';
import { registerCompletion } from './completion.js';

const LANGUAGE = 'kumihimo';

/**
 * Wire the editor to the compiler.
 *
 * Everything here is driven by document events rather than by a timer: a file that is not
 * being edited does not need re-checking, and a language server would be a lot of moving
 * parts for a compiler that already runs in a millisecond.
 */
export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE);
  context.subscriptions.push(collection);

  registerCompletion(context);

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const previewTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const settings = () => vscode.workspace.getConfiguration(LANGUAGE);
  const enabled = () => settings().get<boolean>('diagnostics.enabled', true);
  const delay = () => Math.max(0, settings().get<number>('diagnostics.delay', 250));
  const previewDelay = () => Math.max(0, settings().get<number>('preview.delay', 600));

  /**
   * Redraw the preview, on its own beat.
   *
   * Separate from the diagnostics timer because the two want different rhythms: a squiggle
   * should keep up with typing, a whole diagram should settle first.
   */
  const redraw = (document: vscode.TextDocument, immediate: boolean): void => {
    // Without this, saving any file in the workspace armed a timer for a preview that
    // could never be showing it.
    if (document.languageId !== LANGUAGE) return;

    const key = document.uri.toString();
    const pending = previewTimers.get(key);
    if (pending !== undefined) clearTimeout(pending);

    const run = () => {
      previewTimers.delete(key);
      Preview.refresh(document);
    };

    if (immediate || previewDelay() === 0) {
      run();
      return;
    }
    previewTimers.set(key, setTimeout(run, previewDelay()));
  };

  /** Check now, cancelling any check already waiting for this document. */
  const check = (document: vscode.TextDocument, immediate: boolean): void => {
    if (document.languageId !== LANGUAGE) return;

    const key = document.uri.toString();
    const pending = timers.get(key);
    if (pending !== undefined) clearTimeout(pending);

    if (!enabled()) {
      collection.delete(document.uri);
      return;
    }

    const run = () => {
      timers.delete(key);
      checkDocument(document, collection);
    };

    if (immediate || delay() === 0) {
      run();
      return;
    }
    timers.set(key, setTimeout(run, delay()));
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((d) => {
      check(d, true);
      redraw(d, true);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      check(e.document, false);
      redraw(e.document, false);
    }),
    vscode.workspace.onDidSaveTextDocument((d) => {
      check(d, true);
      redraw(d, true);
    }),

    // A closed document's diagnostics belong to nothing, and a stale one in the Problems
    // panel is worse than none: it points at a line that may no longer exist.
    vscode.workspace.onDidCloseTextDocument((d) => {
      for (const map of [timers, previewTimers]) {
        const pending = map.get(d.uri.toString());
        if (pending !== undefined) clearTimeout(pending);
        map.delete(d.uri.toString());
      }
      collection.delete(d.uri);
    }),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(LANGUAGE)) return;
      for (const document of vscode.workspace.textDocuments) {
        check(document, true);
        redraw(document, true);
      }
    }),

    // `auto` means the diagram follows the editor, which it can only do if it is told.
    vscode.window.onDidChangeActiveColorTheme(() => {
      const active = vscode.window.activeTextEditor?.document;
      if (active?.languageId === LANGUAGE) Preview.refresh(active);
    }),

    vscode.commands.registerCommand('kumihimo.showPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId !== LANGUAGE) {
        void vscode.window.showInformationMessage(vscode.l10n.t('Open a .khm file first.'));
        return;
      }
      Preview.show(editor.document);
    }),

    {
      dispose: () => {
        for (const map of [timers, previewTimers]) map.forEach((t) => clearTimeout(t));
      },
    },
  );

  // Files already open when the window starts have had no event of their own.
  for (const document of vscode.workspace.textDocuments) check(document, true);
}

export function deactivate(): void {
  Preview.disposeAll();
}
