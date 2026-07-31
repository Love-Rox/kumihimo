import { compile } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

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
      const { svg, diagnostics } = await compile(document.getText(), { theme: resolveTheme() });
      if (this.#disposed) return;
      this.#panel.webview.html = page(svg, diagnostics.length, this.#panel.webview);
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
function page(svg: string, diagnostics: number, webview: vscode.Webview): string {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  const status =
    diagnostics === 0
      ? '<span class="ok">問題なし / clean</span>'
      : `<span class="warn">${diagnostics} 件の診断 / ${diagnostics} diagnostic${diagnostics === 1 ? '' : 's'}</span>`;

  return shell(
    webview,
    `<header><span class="mono">PREVIEW</span>${status}</header>
     <main><img alt="kumihimo diagram" src="${src}"></main>`,
  );
}

function failure(error: unknown, webview: vscode.Webview): string {
  const message = error instanceof Error ? error.message : String(error);
  return shell(
    webview,
    `<header><span class="mono">PREVIEW</span><span class="warn">描画できませんでした / could not render</span></header>
     <main><pre>${escape(message)}</pre></main>`,
  );
}

function shell(webview: vscode.Webview, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline';">
<style>
  body { margin: 0; padding: 12px; font-family: var(--vscode-font-family);
         color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
           font-size: 11px; }
  .mono { font-family: var(--vscode-editor-font-family); letter-spacing: 0.06em;
          opacity: 0.6; }
  .ok { color: var(--vscode-testing-iconPassed); }
  .warn { color: var(--vscode-editorWarning-foreground); }
  main { background: #fff; border-radius: 6px; padding: 12px; overflow: auto; }
  img { display: block; max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; color: var(--vscode-errorForeground); margin: 0; }
</style>
</head>
<body>${body}</body>
</html>`;
}
