/**
 * Draw kumihimo blocks inside VS Code's own Markdown preview.
 *
 * This runs in the preview's webview, not in the extension host — which is the only place it
 * can run. VS Code renders Markdown through markdown-it, and markdown-it is synchronous:
 * `compile` is not, because the layout engine returns a promise. A plugin that has to answer
 * in one turn cannot wait for a layout, so the fence is left as ordinary code and turned into
 * a drawing here, once the preview has it in the DOM.
 *
 * The whole compiler comes along. That is 1.5 MB of bundle for a preview, and it is the same
 * trade the Obsidian plugin makes for the same reason: the alternative is a second renderer
 * that agrees with the first until it does not.
 *
 * Nothing about the diagram is read from settings. A preview script cannot reach the
 * configuration, and going back to the host for it would mean a message round trip per block
 * — so the drawing follows the preview's own light or dark, and a `diagram { theme: … }` in
 * the source still wins, the way it wins everywhere else.
 */

import type { Diagnostic, Locale } from '@love-rox/kumihimo-core';
import { LOCALES, compile, readableSchedules } from '@love-rox/kumihimo-core';

/** Fences that open a diagram. Both spellings, the same as in Obsidian. */
const LANGUAGES = ['kumihimo', 'khm'];

/**
 * Which theme to draw in.
 *
 * VS Code stamps the preview body with what it is showing. `mono` for high contrast rather
 * than `dark`: high contrast is a request to stop relying on colour, and `mono` is the theme
 * that tells signals apart by line style instead.
 */
function themeOfPreview(): string {
  const body = document.body.classList;
  if (body.contains('vscode-high-contrast') && !body.contains('vscode-high-contrast-light')) {
    return 'mono';
  }
  if (body.contains('vscode-high-contrast-light')) return 'mono';
  return body.contains('vscode-dark') ? 'dark' : 'light';
}

/**
 * Which language to write the headings and the faults in.
 *
 * The rest of the extension follows VS Code's display language, and a diagram in a note has
 * no business disagreeing with the panel beside it. A preview script cannot ask the host, but
 * the webview is given the editor's locale, so `navigator.language` is the same answer by a
 * shorter route. Anything the catalogue does not carry lands on English, as it does in the
 * command line.
 */
function localeOfPreview(): Locale {
  const language = navigator.language.toLowerCase().split(/[_-]/)[0] ?? '';
  return LOCALES.find((l) => l === language) ?? 'en';
}

/** Whether a fenced block is one of ours. */
function isDiagram(code: Element): boolean {
  // Asking about the two names rather than reading back whatever class is there: the
  // package targets the DOM without `DOM.Iterable`, and this reads better besides.
  return LANGUAGES.some((language) => code.classList.contains(`language-${language}`));
}

/** A table element built from one readable sheet. */
function tableOf(head: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  const table = document.createElement('table');
  const thead = table.createTHead().insertRow();
  for (const cell of head) {
    const th = document.createElement('th');
    th.textContent = cell;
    thead.appendChild(th);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const cell of row) tr.insertCell().textContent = cell;
  }
  return table;
}

/** The diagnostics, as a list somebody can read without leaving the preview. */
function diagnosticsOf(diagnostics: readonly Diagnostic[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'kumihimo-diagnostics';
  for (const diagnostic of diagnostics) {
    const item = document.createElement('li');
    item.dataset['severity'] = diagnostic.severity;

    const severity = document.createElement('span');
    severity.className = 'kumihimo-severity';
    severity.textContent = diagnostic.severity;

    const code = document.createElement('code');
    code.textContent = diagnostic.code;

    item.append(severity, code, document.createTextNode(` ${diagnostic.message}`));
    list.appendChild(item);
  }
  return list;
}

/**
 * Replace one fenced block with its drawing.
 *
 * @param pre - The `<pre>` VS Code rendered the fence into.
 * @param source - What the author wrote inside it.
 */
async function draw(pre: Element, source: string, locale: Locale): Promise<void> {
  const root = document.createElement('div');
  root.className = 'kumihimo';

  let svg: string;
  let diagnostics: readonly Diagnostic[];
  let diagram;
  try {
    ({ svg, diagnostics, diagram } = await compile(source, { theme: themeOfPreview(), locale }));
  } catch (error) {
    // `compile` is documented never to throw. If that ever stops being true the preview says
    // so, rather than leaving the fence looking like a block nobody claimed.
    const failure = document.createElement('pre');
    failure.className = 'kumihimo-error';
    failure.textContent = error instanceof Error ? error.message : String(error);
    root.appendChild(failure);
    pre.replaceWith(root);
    return;
  }

  const figure = document.createElement('div');
  figure.className = 'kumihimo-diagram';
  // The drawing is markup this extension generated from text in the open file, and it
  // carries no script — there is a test in core that asserts exactly that. It is parsed
  // rather than assigned so that what lands in the document is an SVG and only an SVG.
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const drawn = parsed.documentElement;
  if (drawn.nodeName === 'parsererror') {
    figure.textContent = svg;
  } else {
    figure.appendChild(document.importNode(drawn, true));
  }
  root.appendChild(figure);

  if (diagnostics.length > 0) root.appendChild(diagnosticsOf(diagnostics));

  for (const sheet of readableSchedules(diagram, locale)) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = sheet.title;
    details.append(summary, tableOf(sheet.head, sheet.rows));
    root.appendChild(details);
  }

  pre.replaceWith(root);
}

/**
 * Find every block in the document and draw it.
 *
 * Called again on each re-render: VS Code rebuilds the preview's body when the file changes,
 * which puts the fences back as `<pre>` and undoes everything below.
 */
function drawAll(): void {
  const locale = localeOfPreview();
  for (const code of Array.from(document.querySelectorAll('pre > code'))) {
    if (!isDiagram(code)) continue;
    const pre = code.parentElement;
    if (pre === null) continue;
    // Claimed before the first `await`, because the observer below fires on the replacement
    // this is about to make. Without the mark, a block still being laid out is found again
    // and laid out a second time, and whichever finishes last wins.
    if (pre.hasAttribute('data-kumihimo')) continue;
    pre.setAttribute('data-kumihimo', '');
    void draw(pre, code.textContent ?? '', locale);
  }
}

drawAll();
// The preview replaces its body rather than reloading, so there is no second `load` to hang
// this on. Watching the document is what makes an edit show up as a redrawn diagram instead
// of a code block that reappears and stays one.
new MutationObserver(() => {
  drawAll();
}).observe(document.body, { childList: true, subtree: true });
