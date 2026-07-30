/**
 * Turns diagnostics into something worth reading in a terminal.
 *
 * A wiring fault is only useful if the author can see which cable it is about, so every
 * diagnostic is printed against the line that caused it, with the offending span
 * underlined.
 */

import type { Diagnostic, Severity } from '@love-rox/kumihimo-core';

/** ANSI escape codes, or empty strings when colour is off. */
interface Palette {
  reset: string;
  bold: string;
  dim: string;
  red: string;
  yellow: string;
  blue: string;
  green: string;
}

const COLOR: Palette = {
  reset: '[0m',
  bold: '[1m',
  dim: '[2m',
  red: '[31m',
  yellow: '[33m',
  blue: '[34m',
  green: '[32m',
};

const PLAIN: Palette = {
  reset: '',
  bold: '',
  dim: '',
  red: '',
  yellow: '',
  blue: '',
  green: '',
};

/** How to format diagnostics. */
export interface FormatOptions {
  /** Path shown in the location prefix. */
  file?: string;
  /** Source text, used to quote the offending line. Omit to print locations only. */
  source?: string;
  /** Emit ANSI colour. Defaults to `false`. */
  color?: boolean;
}

function severityColor(severity: Severity, p: Palette): string {
  if (severity === 'error') return p.red;
  if (severity === 'warning') return p.yellow;
  return p.blue;
}

/**
 * Render one diagnostic as a block of terminal output.
 *
 * @param diagnostic - The diagnostic to render.
 * @param options - File name, source text and colour preference.
 * @returns The formatted block, without a trailing newline.
 */
export function formatDiagnostic(diagnostic: Diagnostic, options: FormatOptions = {}): string {
  const p = options.color ? COLOR : PLAIN;
  const tint = severityColor(diagnostic.severity, p);
  const where = diagnostic.span
    ? `${options.file ?? '<input>'}:${diagnostic.span.start.line}:${diagnostic.span.start.column}`
    : (options.file ?? '<input>');

  const head =
    `${p.bold}${where}${p.reset} ` +
    `${tint}${diagnostic.severity}${p.reset}${p.dim}[${diagnostic.code}]${p.reset}` +
    `\n  ${diagnostic.message}`;

  if (!options.source || !diagnostic.span) return head;

  const lines = options.source.split('\n');
  const lineNumber = diagnostic.span.start.line;
  const text = lines[lineNumber - 1];
  if (text === undefined) return head;

  const gutter = String(lineNumber);
  const pad = ' '.repeat(gutter.length);
  // A span may run past the end of its first line; clamp so the underline stays put.
  const from = diagnostic.span.start.column - 1;
  const to =
    diagnostic.span.end.line === lineNumber
      ? Math.max(diagnostic.span.end.column - 1, from + 1)
      : text.length;
  const underline = ' '.repeat(from) + tint + '~'.repeat(Math.max(1, to - from)) + p.reset;

  return (
    `${head}\n` +
    `${p.dim}${pad} |${p.reset}\n` +
    `${p.dim}${gutter} |${p.reset} ${text}\n` +
    `${p.dim}${pad} |${p.reset} ${underline}`
  );
}

/** How many diagnostics of each severity a run produced. */
export interface DiagnosticSummary {
  /** Number of errors. */
  errors: number;
  /** Number of warnings. */
  warnings: number;
  /** Number of informational notes. */
  infos: number;
}

/**
 * Count diagnostics by severity.
 *
 * @param diagnostics - The diagnostics to count.
 * @returns Totals per severity.
 */
export function summarize(diagnostics: readonly Diagnostic[]): DiagnosticSummary {
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
  };
}

/**
 * Render a whole run's diagnostics, followed by a one-line summary.
 *
 * @param diagnostics - The diagnostics to render.
 * @param options - File name, source text and colour preference.
 * @returns The formatted report, without a trailing newline.
 */
export function formatReport(
  diagnostics: readonly Diagnostic[],
  options: FormatOptions = {},
): string {
  const p = options.color ? COLOR : PLAIN;
  if (diagnostics.length === 0) {
    return `${p.green}✓${p.reset} 問題は見つかりませんでした`;
  }

  const { errors, warnings, infos } = summarize(diagnostics);
  const counts = [
    errors > 0 ? `${p.red}${errors} error${p.reset}` : '',
    warnings > 0 ? `${p.yellow}${warnings} warning${p.reset}` : '',
    infos > 0 ? `${p.blue}${infos} info${p.reset}` : '',
  ].filter(Boolean);

  return [
    ...diagnostics.map((d) => formatDiagnostic(d, options)),
    '',
    counts.join(p.dim + ', ' + p.reset),
  ].join('\n');
}
