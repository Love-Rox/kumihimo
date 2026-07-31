import { buildModel, parse } from '@love-rox/kumihimo-core';
import type { Diagnostic as KumihimoDiagnostic, Severity } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

/**
 * Check a document and publish what the compiler found.
 *
 * Parsing and building, not compiling: the diagnostics all come from those two stages, and
 * laying out a diagram nobody asked to see costs the typist their responsiveness.
 */
export function checkDocument(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
): void {
  const { document: ast, diagnostics: parsed } = parse(document.getText());
  const { diagnostics: built } = buildModel(ast);

  collection.set(
    document.uri,
    [...parsed, ...built].map((d) => toVscode(d, document)),
  );
}

const SEVERITY: Record<Exclude<Severity, 'off'>, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

function toVscode(d: KumihimoDiagnostic, document: vscode.TextDocument): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    rangeOf(d, document),
    d.message,
    SEVERITY[d.severity as Exclude<Severity, 'off'>] ?? vscode.DiagnosticSeverity.Warning,
  );

  // The rule name, linked to the section of the spec that explains it. A verdict without a
  // reason is the thing this language exists to avoid; the same applies to its own output.
  diagnostic.code = {
    value: d.code,
    target: vscode.Uri.parse(
      'https://github.com/Love-Rox/kumihimo/blob/main/docs/SPEC.md#11-diagnostics',
    ),
  };
  diagnostic.source = 'kumihimo';
  return diagnostic;
}

/**
 * Where to underline.
 *
 * The compiler counts lines and columns from one and VS Code from zero. A diagnostic that
 * knows no span still has to point somewhere, and the first line is the least misleading
 * place — it reads as "this file", not as "this line".
 */
function rangeOf(d: KumihimoDiagnostic, document: vscode.TextDocument): vscode.Range {
  if (!d.span) return document.lineAt(0).range;

  const start = new vscode.Position(d.span.start.line - 1, d.span.start.column - 1);
  const end = new vscode.Position(d.span.end.line - 1, d.span.end.column - 1);
  // A zero-width range shows no underline at all, so give it the rest of the line.
  return start.isEqual(end) ? document.lineAt(start.line).range : new vscode.Range(start, end);
}
