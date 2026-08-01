/**
 * Getting a drawing out of the editor and onto paper.
 *
 * Three commands: the drawing as SVG, the drawing as PNG, and everything on paper.
 *
 * The PNG goes through the preview panel, because a canvas is the only renderer available
 * and the panel is where the drawing already is. That does not weaken what the panel
 * guarantees. The thing that stops somebody else's drawing running here is that the SVG
 * sits in an `<img>` — a browser refuses to run script in an image whatever else the page
 * may do — not the scripts flag, which was belt as well as braces. The page's one script
 * runs under a nonce and never touches the SVG as markup.
 *
 * Only the drawing is exported as an image. The schedules are text, and text belongs on
 * the print page, where it stays selectable and reflows to the paper.
 */

import type { Diagram, Locale } from '@love-rox/kumihimo-core';
import { SCHEDULES, SCHEDULE_KINDS, compile, formatCell, localise } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

import { editorLocale } from './locale.js';
import { Preview } from './preview.js';
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
 * The drawing, as a PNG.
 *
 * The preview has to be open, and is opened if it is not: this exports what the panel is
 * showing, and there is nothing to read off a panel that does not exist. Twice the
 * drawing's own size, which is what makes it usable in a document rather than a thumbnail.
 */
export async function exportPng(): Promise<void> {
  const document = activeDocument();
  if (document === undefined) return;

  Preview.show(document);

  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(document.uri, `../${stemOf(document)}.png`),
    filters: { PNG: ['png'] },
  });
  if (target === undefined) return;

  try {
    const png = await Preview.toPng(2);
    await vscode.workspace.fs.writeFile(target, png);
    const open = vscode.l10n.t('Open');
    const answer = await vscode.window.showInformationMessage(
      vscode.l10n.t('Saved {0}', target.path.split('/').pop() ?? ''),
      open,
    );
    if (answer === open) await vscode.env.openExternal(target);
  } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Every schedule as Markdown tables.
 *
 * The format a schedule ends up pasted into more often than any other — an issue, a hand-
 * over note, a wiki page — and the one that survives being read as plain text when nothing
 * renders it. Cells escape their pipes; a cable labelled `A|B` would otherwise split its
 * own row in two.
 */
export async function exportMarkdown(): Promise<void> {
  const document = activeDocument();
  if (document === undefined) return;

  const { diagram, locale } = await compiled(document);
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(document.uri, `../${stemOf(document)}.md`),
    filters: { Markdown: ['md'] },
  });
  if (target === undefined) return;

  await writeChosen(target, markdown(stemOf(document), diagram, locale));
}

/**
 * The schedules, as Markdown.
 *
 * Three things a table needs before it is worth pasting into a document.
 *
 * An **unheaded column continues the one before it** — that is what the registry means by
 * a column with no heading, and it is how the port sits under its device in the editor.
 * Markdown has no way to draw that, so the pair goes in one cell. Emitting a blank heading
 * instead would leave a column nobody can name.
 *
 * A column **empty in every row is dropped**. On a sheet somebody scrolls, a column of
 * dashes is width spent saying nothing.
 *
 * And `false` is **not a word anybody wants in a table**. A device that was never declared
 * is worth marking; the seven that were are not worth seven `false`s.
 *
 * @param title - Name of the drawing, used as the heading.
 * @param diagram - The resolved diagram.
 * @param locale - Language for the headings and the names inside the rows.
 * @returns A Markdown document.
 */
function markdown(title: string, diagram: Diagram, locale: Locale): string {
  const ja = locale === 'ja';

  const text = (value: unknown): string => {
    if (value === false) return '';
    if (value === true) return ja ? '未宣言' : 'undeclared';
    // A cable labelled `A|B` would otherwise split its own row in two.
    return formatCell(value).replace(/\|/g, '\\|');
  };

  const sections = SCHEDULE_KINDS.flatMap((kind) => {
    const schedule = SCHEDULES[kind];
    const rows = schedule.rows(diagram, locale);
    // An empty schedule is left out. A heading with an empty table under it says "this was
    // considered and there is nothing"; on a page somebody scrolls, it just says nothing.
    if (rows.length === 0) return [];

    // Group each headed column with the unheaded ones that follow it.
    const groups: { head: string; keys: string[] }[] = [];
    for (const column of schedule.columns) {
      if (column.head !== undefined || groups.length === 0) {
        groups.push({
          head: column.head === undefined ? '' : localise(column.head, locale),
          keys: [],
        });
      }
      groups[groups.length - 1]?.keys.push(column.key);
    }

    const cellsOf = (row: Record<string, unknown>, group: { keys: string[] }): string => {
      const parts = group.keys.map((key) => text(row[key])).filter((part) => part !== '');
      // An id that only repeats the name it follows is dropped: `SDI sdi` and `XLR xlr` are
      // a stutter. `SONY FX3 cam1` is not — that id is the word somebody types in the
      // source, and it cannot be worked out from the name.
      const [first, ...rest] = parts;
      if (first === undefined) return '';
      const head = first.toLowerCase();
      return [first, ...rest.filter((part) => !head.startsWith(part.toLowerCase()))].join(' ');
    };

    const used = groups.filter((group) => rows.some((row) => cellsOf(row, group) !== ''));
    if (used.length === 0) return [];

    return [
      `## ${localise(schedule.title, locale)}`,
      '',
      `| ${used.map((g) => g.head).join(' | ')} |`,
      `| ${used.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${used.map((g) => cellsOf(row, g) || '—').join(' | ')} |`),
      '',
    ];
  });

  return [`# ${title}`, '', ...sections].join('\n');
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
