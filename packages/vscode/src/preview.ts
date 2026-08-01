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

  /** A render in flight. A second one must not start beside it. */
  #rendering = false;
  /** A document that arrived while one was in flight. Only the newest is worth drawing. */
  #queued: vscode.TextDocument | undefined;
  /** What the panel is currently showing, so an identical redraw can be skipped. */
  #shown = '';
  /** The last document seen while the panel was hidden, drawn when it comes back. */
  #missed: vscode.TextDocument | undefined;
  /**
   * The nonce the page's one script runs under.
   *
   * Per panel rather than per render on purpose: {@link Preview.#shown} skips a redraw when
   * the markup is unchanged, and a nonce that moved every time would make every render look
   * different and reload the webview on every keystroke.
   */
  readonly #nonce = Buffer.from(`${Date.now()}${Math.random()}`).toString('base64url').slice(0, 24);

  private constructor(panel: vscode.WebviewPanel, uri: vscode.Uri) {
    this.#panel = panel;
    this.#uri = uri;
    panel.onDidDispose(() => {
      this.#disposed = true;
      Preview.#current = undefined;
    });

    // A panel in a background tab is not being looked at, and drawing into it costs the
    // same as drawing into a visible one. Catch up when it comes back.
    panel.onDidChangeViewState(() => {
      const missed = this.#missed;
      if (panel.visible && missed) {
        this.#missed = undefined;
        void this.render(missed);
      }
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
      // Scripts, under a nonce, and nothing loaded from disk.
      //
      // What keeps somebody else's drawing from running here is not this flag — it is that
      // the SVG goes into an `<img>`. A browser refuses to run script in an image whatever
      // else the page is allowed to do, which removes the class rather than filtering it.
      // The flag was belt as well as braces, and it cost the export: turning an SVG into a
      // PNG needs a canvas, and a canvas needs script. The CSP names a nonce, so the only
      // script that runs is the one written below.
      //
      // `retainContextWhenHidden` is deliberately not set. The editor's own documentation
      // warns it is memory-expensive, and it buys nothing here: the page holds no state a
      // reader would lose, and it is redrawn on the way back anyway.
      { enableScripts: true },
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

  /**
   * The diagram pane, as PNG bytes.
   *
   * Done in the panel because that is where the drawing already is, as an `<img>` a canvas
   * can be told to draw. The extension host has no canvas and no renderer; bringing one in
   * would mean a native binary per platform inside the .vsix.
   *
   * Only the diagram. The schedules are text, and text belongs on the print page where it
   * stays selectable and reflows to the paper.
   *
   * @param scale - Multiplier on the drawing's own size. 2 gives a usable screenshot.
   * @returns The PNG bytes.
   * @throws If no preview is open, or the panel does not answer.
   */
  static async toPng(scale: number): Promise<Uint8Array> {
    const current = Preview.#current;
    if (!current || current.#disposed) throw new Error(vscode.l10n.t('Open the preview first.'));
    return current.#png(scale);
  }

  async #png(scale: number): Promise<Uint8Array> {
    const answer = new Promise<string>((resolve, reject) => {
      // A render replaces the whole page, and a page that has been replaced will never
      // answer. Better to say so than to wait for something that is not coming.
      const timer = setTimeout(() => {
        listener.dispose();
        reject(new Error(vscode.l10n.t('The preview did not answer.')));
      }, 10_000);

      const listener = this.#panel.webview.onDidReceiveMessage((message: unknown) => {
        const reply = message as { type?: string; dataUrl?: string; error?: string };
        if (reply.type !== 'png') return;
        clearTimeout(timer);
        listener.dispose();
        if (typeof reply.dataUrl === 'string') resolve(reply.dataUrl);
        else reject(new Error(reply.error ?? vscode.l10n.t('The preview did not answer.')));
      });
    });

    await this.#panel.webview.postMessage({ type: 'png', scale });
    const dataUrl = await answer;
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  }

  /**
   * Draw the document, unless there is already a drawing in flight.
   *
   * Renders do not queue up. A keystroke that lands mid-render replaces whatever was
   * waiting, because the only drawing worth having is the one of the newest text — and
   * without this the panel could finish an older render last and show stale wiring.
   */
  async render(document: vscode.TextDocument): Promise<void> {
    if (this.#disposed) return;

    if (this.#rendering) {
      this.#queued = document;
      return;
    }

    // Nobody is looking at a background tab. Remember what it missed and stop.
    if (!this.#panel.visible) {
      this.#missed = document;
      return;
    }

    this.#rendering = true;
    try {
      await this.#draw(document);
    } finally {
      this.#rendering = false;
    }

    const next = this.#queued;
    if (next && !this.#disposed) {
      this.#queued = undefined;
      await this.render(next);
    }
  }

  async #draw(document: vscode.TextDocument): Promise<void> {
    const name = document.uri.path.split('/').pop() ?? 'kumihimo';
    this.#panel.title = `${name} — kumihimo`;

    let html: string;
    try {
      const locale = editorLocale();
      const { svg, diagram, diagnostics } = await compile(document.getText(), {
        theme: resolveTheme(),
        locale,
      });
      if (this.#disposed) return;
      html = page(
        svg,
        tablesOf(diagram, locale),
        diagnostics.length,
        this.#panel.webview,
        this.#nonce,
      );
    } catch (error) {
      if (this.#disposed) return;
      // compile() is documented never to throw; if that ever stops being true the preview
      // says so rather than going blank and leaving the author guessing.
      html = failure(error, this.#panel.webview, this.#nonce);
    }

    // Assigning `html` reloads the webview — the document is torn down, the markup parsed
    // again, and the drawing decoded from its data URI again. An edit that does not change
    // the picture, which is most of them mid-word, should not cost that.
    if (html === this.#shown) return;
    this.#shown = html;
    this.#panel.webview.html = html;
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
function page(
  svg: string,
  tables: Table[],
  diagnostics: number,
  webview: vscode.Webview,
  nonce: string,
): string {
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
    nonce,
    `${inputs}
     <header><nav class="tabs">${labels}</nav>${status}</header>
     <main>${bodies}</main>`,
    panes.map((p) => p.id),
  );
}

function failure(error: unknown, webview: vscode.Webview, nonce: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return shell(
    webview,
    nonce,
    `<header><span class="warn">${escape(vscode.l10n.t('Could not render.'))}</span></header>
     <main><pre>${escape(message)}</pre></main>`,
    [],
  );
}

function shell(webview: vscode.Webview, nonce: string, body: string, panes: string[]): string {
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
      content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
<body>${body}
<script nonce="${nonce}">
// The only script on the page, and it does one thing: turn the drawing into PNG bytes when
// the extension asks. It never reads the SVG as markup — it draws the <img> that is already
// on the page, which is what keeps somebody else's drawing from ever being executable here.
(function () {
  var vscode = acquireVsCodeApi();

  window.addEventListener('message', function (event) {
    var ask = event.data;
    if (!ask || ask.type !== 'png') return;

    // The diagram pane, not whichever tab happens to be showing. Exporting what is on
    // screen would give an empty PNG to anyone who had clicked through to a schedule.
    var img = document.querySelector('[data-pane="diagram"] img');
    if (!img) {
      vscode.postMessage({ type: 'png', error: 'no diagram' });
      return;
    }

    try {
      var scale = ask.scale || 2;
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      var ctx = canvas.getContext('2d');
      // Paper, not transparency: a diagram dropped into a dark document with a transparent
      // background loses every black line in it.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      vscode.postMessage({ type: 'png', dataUrl: canvas.toDataURL('image/png') });
    } catch (error) {
      vscode.postMessage({ type: 'png', error: String(error) });
    }
  });
})();
</script>
</body>
</html>`;
}
