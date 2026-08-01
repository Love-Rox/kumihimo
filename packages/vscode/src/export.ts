/**
 * Getting a drawing out of the editor and onto paper.
 *
 * Two commands, and neither needs a script anywhere. The preview is deliberately built
 * with `enableScripts: false` — the SVG is compiled from a file that arrived with somebody
 * else's repository, and rendering it as an `<img>` rather than inline `<svg>` removes the
 * whole class of script-in-an-image rather than filtering it. Producing a PNG would mean a
 * canvas, which means a scripted webview, which means giving that back. The print page
 * carries the drawing as vector and prints as vector, so nothing is lost by not having one.
 */

import { compile } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

import { editorLocale } from './locale.js';
import type { Table } from './tables.js';
import { tablesOf } from './tables.js';

const LANGUAGE = 'kumihimo';

/** The active `.khm` document, or a message saying there is not one. */
function activeDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId !== LANGUAGE) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Open a .khm file first.'));
    return undefined;
  }
  return editor.document;
}

/** The document's name without its extension, for naming what comes out of it. */
function stemOf(document: vscode.TextDocument): string {
  const name = document.uri.path.split('/').pop() ?? 'diagram';
  return name.replace(/\.khm$/i, '') || 'diagram';
}

/**
 * Compile the document, and say so if it had anything to complain about.
 *
 * Warnings do not stop an export. A drawing with a questionable run on it is still the
 * drawing somebody wants to take to site, and refusing to print it would help nobody — but
 * leaving without a word would let a warning reach paper unnoticed.
 */
async function compiled(document: vscode.TextDocument) {
  const locale = editorLocale();
  const result = await compile(document.getText(), { locale });
  if (result.diagnostics.length > 0) {
    void vscode.window.showWarningMessage(
      vscode.l10n.t('{0} diagnostic(s)', result.diagnostics.length),
    );
  }
  return { ...result, locale };
}

/** Write bytes where the author chose, and offer to open what was written. */
async function writeChosen(target: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
  const open = vscode.l10n.t('Open');
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t('Saved {0}', target.path.split('/').pop() ?? ''),
    open,
  );
  if (answer === open) await vscode.env.openExternal(target);
}

/** `export` on the command palette: the drawing, as an SVG file. */
export async function exportSvg(): Promise<void> {
  const document = activeDocument();
  if (document === undefined) return;

  const { svg } = await compiled(document);
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(document.uri, `../${stemOf(document)}.svg`),
    filters: { SVG: ['svg'] },
  });
  if (target === undefined) return;
  await writeChosen(target, svg);
}

/**
 * The drawing and every schedule, on paper.
 *
 * Written to the extension's own storage and opened in the default browser, where "Save as
 * PDF" lives in the print dialog. Producing the PDF here instead would mean a PDF library
 * and a CJK font to embed in it — measured, that is around 15 MB added to an extension
 * whose only dependency today is the compiler, and the fonts that would do the job are not
 * ones anybody may redistribute. The browser already has both, and it already knows the
 * paper size.
 */
export async function print(context: vscode.ExtensionContext): Promise<void> {
  const document = activeDocument();
  if (document === undefined) return;

  const { svg, diagram, locale } = await compiled(document);
  const html = printable(stemOf(document), svg, tablesOf(diagram, locale), locale);

  // Somewhere the editor already manages, rather than beside the source: a print-out is
  // not part of the drawing and should not turn up in anybody's diff.
  await vscode.workspace.fs.createDirectory(context.globalStorageUri);
  const target = vscode.Uri.joinPath(context.globalStorageUri, `${stemOf(document)}.html`);
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(html));
  await vscode.env.openExternal(target);
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A page built to be printed rather than to be looked at.
 *
 * The drawing is an `<img>` holding the SVG, for the reason the preview gives: an image
 * cannot run what an inline `<svg>` could, and this file is about to be opened in the
 * author's own browser. An SVG in an `<img>` still prints as vector, so nothing is traded
 * away for it.
 *
 * @param title - Name of the drawing, used as the running head.
 * @param svg - The compiled drawing.
 * @param tables - The schedules, already rendered.
 * @param locale - Language for the page's own words.
 * @returns A complete HTML document.
 */
function printable(title: string, svg: string, tables: Table[], locale: string): string {
  const ja = locale === 'ja';
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const sheets = tables
    .map((table) =>
      table.count === 0 ? '' : `<section><h2>${escape(table.label)}</h2>${table.html}</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${ja ? 'ja' : 'en'}">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  /* Landscape, because a cable schedule is wider than it is tall and a diagram more so. */
  @page { size: A4 landscape; margin: 12mm; }

  :root { color-scheme: light; }
  body {
    margin: 0;
    background: #fff;
    color: #111;
    font: 10pt/1.5 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
  }
  header { display: flex; align-items: baseline; gap: 1em; margin-bottom: 8mm; }
  h1 { margin: 0; font-size: 15pt; }
  .hint { color: #666; font-size: 9pt; }

  /* Each schedule starts its own sheet: the person holding the cable list is not the
     person holding the equipment list, and they should be able to hold one each. */
  section { break-before: page; }
  section:first-of-type { break-before: auto; }
  h2 { font-size: 12pt; margin: 0 0 3mm; }

  figure { margin: 0 0 8mm; break-inside: avoid; }
  /* A4 landscape less 12mm margins is 273 x 186mm, and the running head takes some of it.
     Bounding the height in mm rather than vh because vh means nothing to a printer: a tall
     drawing would otherwise run off the bottom of the sheet and simply be cut. */
  img {
    display: block;
    max-width: 100%;
    max-height: 165mm;
    width: auto;
    height: auto;
    margin-inline: auto;
  }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th, td {
    padding: 1.6mm 2mm;
    border-bottom: 0.2mm solid #bbb;
    text-align: left;
    vertical-align: top;
  }
  th { border-bottom-width: 0.4mm; font-weight: 600; white-space: nowrap; }
  /* A row must not be split across a page break; a reader would take the halves for two. */
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .empty { color: #666; }

  @media print { .hint { display: none; } }
</style>
</head>
<body>
<header>
  <h1>${escape(title)}</h1>
  <span class="hint">${ja ? 'Cmd/Ctrl+P →「PDF として保存」' : 'Cmd/Ctrl+P → “Save as PDF”'}</span>
</header>
<figure><img src="${encoded}" alt="${escape(title)}"></figure>
${sheets}
</body>
</html>
`;
}
