import { compile } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

import { editorLocale } from './locale.js';
import type { Table } from './tables.js';
import { tablesOf } from './tables.js';

type ThemeSetting = 'auto' | 'light' | 'dark' | 'mono' | 'blueprint';

/**
 * The diagram, beside the source.
 *
 * One panel, reused. Opening the preview from a second file retargets the existing panel
 * rather than stacking another: two live previews of two files is a window management
 * problem the editor already solves with split panes.
 */
export class Preview {
  static #current: Preview | undefined;

  readonly #panel: vscode.WebviewPanel;
  #uri: vscode.Uri;
  #disposed = false;

  private constructor(panel: vscode.WebviewPanel, uri: vscode.Uri) {
    this.#panel = panel;
    this.#uri = uri;
    panel.onDidDispose(() => {
      this.#disposed = true;
      Preview.#current = undefined;
    });
  }

  static show(document: vscode.TextDocument): void {
    if (Preview.#current && !Preview.#current.#disposed) {
      Preview.#current.#uri = document.uri;
      Preview.#current.#panel.reveal(vscode.ViewColumn.Beside, true);
      void Preview.#current.render(document);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'kumihimo.preview',
      'kumihimo',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      // No scripts and nothing loaded from disk: the page is a heading and an image.
      { enableScripts: false, retainContextWhenHidden: true },
    );

    Preview.#current = new Preview(panel, document.uri);
    void Preview.#current.render(document);
  }

  /** Redraw, if this document is the one on show. */
  static refresh(document: vscode.TextDocument): void {
    const current = Preview.#current;
    if (current && !current.#disposed && current.#uri.toString() === document.uri.toString()) {
      void current.render(document);
    }
  }

  static disposeAll(): void {
    const current = Preview.#current;
    if (current) current.#panel.dispose();
  }

  async render(document: vscode.TextDocument): Promise<void> {
    if (this.#disposed) return;

    const name = document.uri.path.split('/').pop() ?? 'kumihimo';
    this.#panel.title = `${name} — kumihimo`;

    try {
      const locale = editorLocale();
      const { svg, diagram, diagnostics } = await compile(document.getText(), {
        theme: resolveTheme(),
        locale,
      });
      if (this.#disposed) return;
      this.#panel.webview.html = page(
        svg,
        tablesOf(diagram, locale),
        diagnostics.length,
        this.#panel.webview,
      );
    } catch (error) {
      if (this.#disposed) return;
      // compile() is documented never to throw; if that ever stops being true the preview
      // says so rather than going blank and leaving the author guessing.
      this.#panel.webview.html = failure(error, this.#panel.webview);
    }
  }
}

/** The theme to draw with. A `diagram { theme: … }` in the source overrides this downstream. */
function resolveTheme(): 'light' | 'dark' | 'mono' | 'blueprint' {
  const setting = vscode.workspace
    .getConfiguration('kumihimo')
    .get<ThemeSetting>('preview.theme', 'auto');

  if (setting !== 'auto') return setting;

  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    ? 'dark'
    : 'light';
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The SVG, as an image rather than as markup.
 *
 * A webview is a privileged context and this SVG was compiled from a file that arrived with
 * somebody else's repository. An `<svg>` element inlined into the page can carry script; the
 * same bytes in an `<img>` cannot, because browsers refuse to run script in an image. That
 * removes the whole class rather than filtering it, which is worth more than selectable text.
 */
function page(svg: string, tables: Table[], diagnostics: number, webview: vscode.Webview): string {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  const status =
    diagnostics === 0
      ? `<span class="ok">${escape(vscode.l10n.t('clean'))}</span>`
      : `<span class="warn">${escape(
          vscode.l10n.t('{0} diagnostic(s)', String(diagnostics)),
        )}</span>`;

  const panes = [
    { id: 'diagram', label: vscode.l10n.t('Diagram'), body: `<img alt="" src="${src}">` },
    ...tables.map((t) => ({
      id: t.id,
      label: t.count > 0 ? `${t.label} (${t.count})` : t.label,
      body: t.html,
    })),
  ];

  // Radio inputs and sibling selectors rather than script: the panel runs with scripts
  // disabled, and switching a tab is not worth turning them back on for.
  const inputs = panes
    .map(
      (pane, i) =>
        `<input type="radio" name="pane" id="tab-${pane.id}"${i === 0 ? ' checked' : ''}>`,
    )
    .join('');
  const labels = panes
    .map((pane) => `<label for="tab-${pane.id}">${escape(pane.label)}</label>`)
    .join('');
  const bodies = panes
    .map((pane) => `<section class="pane" data-pane="${pane.id}">${pane.body}</section>`)
    .join('');

  return shell(
    webview,
    `${inputs}
     <header><nav class="tabs">${labels}</nav>${status}</header>
     <main>${bodies}</main>`,
    panes.map((p) => p.id),
  );
}

function failure(error: unknown, webview: vscode.Webview): string {
  const message = error instanceof Error ? error.message : String(error);
  return shell(
    webview,
    `<header><span class="warn">${escape(vscode.l10n.t('Could not render.'))}</span></header>
     <main><pre>${escape(message)}</pre></main>`,
    [],
  );
}

function shell(webview: vscode.Webview, body: string, panes: string[]): string {
  // One rule per pane, generated: `#tab-cables:checked ~ main [data-pane="cables"]`. Written
  // out rather than looped in script, for the same reason the tabs are radios.
  const paneRules = panes
    .map(
      (id) => `
  #tab-${id}:checked ~ main [data-pane="${id}"] { display: block; }
  #tab-${id}:checked ~ header label[for="tab-${id}"] {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder);
  }`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline';">
<style>
  body { margin: 0; padding: 12px; font-family: var(--vscode-font-family);
         color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
           font-size: 11px; }
  .tabs { display: flex; gap: 2px; }
  .tabs label {
    padding: 4px 10px; cursor: pointer; font-size: 12px;
    color: var(--vscode-descriptionForeground);
    border-bottom: 2px solid transparent;
  }
  .tabs label:hover { color: var(--vscode-foreground); }
  input[name="pane"] { position: absolute; opacity: 0; pointer-events: none; }
  /* Keyboard focus has to remain visible even though the control itself is not. */
  input[name="pane"]:focus-visible + * label,
  .tabs label:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  .ok { color: var(--vscode-testing-iconPassed); }
  .warn { color: var(--vscode-editorWarning-foreground); }
  main { overflow: auto; }
  .pane { display: none; }
  /* The drawing is dark ink on paper whatever the editor theme is, so it keeps its own
     background rather than sitting on a dark one and losing its lines. */
  .pane[data-pane="diagram"] { background: #fff; border-radius: 6px; padding: 12px; }
  img { display: block; max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top;
           border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.3)); }
  th { color: var(--vscode-descriptionForeground); font-weight: 500; white-space: nowrap; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 12px; }
  pre { white-space: pre-wrap; color: var(--vscode-errorForeground); margin: 0; }
${paneRules}
</style>
</head>
<body>${body}</body>
</html>`;
}
