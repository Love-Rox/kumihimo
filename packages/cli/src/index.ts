/**
 * Public API of `@love-rox/kumihimo-cli`.
 *
 * The command line entry point lives in `cli.js`; this module exposes the pieces the CLI
 * is built from, so a build script can reuse them without spawning a process.
 */

export type { FormatOptions, DiagnosticSummary } from './format.js';
export { formatDiagnostic, formatReport, summarize } from './format.js';

export type { BuildCommandOptions, BuildCommandResult } from './commands.js';
export { runBuild, runCheck } from './commands.js';

export type { ExportFormat, ExportCommandOptions, ExportCommandResult } from './export.js';
export { EXPORT_FORMATS, EXPORT_EXTENSIONS, runExport } from './export.js';

export { createFileResolver } from './resolver.js';
