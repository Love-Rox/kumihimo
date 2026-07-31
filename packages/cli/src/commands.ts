/**
 * The work behind each subcommand, separated from argument parsing so it can be tested
 * and reused without a process.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { CompileOptions, Diagnostic, FormatOptions } from '@love-rox/kumihimo-core';
import { compile, formatSource } from '@love-rox/kumihimo-core';

import { formatReport, summarize } from './format.js';
import { createFileResolver } from './resolver.js';

/** How to run a build or check. */
export interface BuildCommandOptions extends CompileOptions {
  /** Where to write the SVG. Omit to skip writing. */
  out?: string;
  /** Treat warnings as failures. */
  strict?: boolean;
  /** Emit ANSI colour in the report. */
  color?: boolean;
  /** Suppress the report entirely. */
  quiet?: boolean;
}

/** What a build or check produced. */
export interface BuildCommandResult {
  /** The rendered SVG, whether or not it was written. */
  svg: string;
  /** Everything the compile had to say. */
  diagnostics: readonly Diagnostic[];
  /** The formatted report, ready to print. */
  report: string;
  /** Process exit code: non-zero when the run should be considered a failure. */
  exitCode: number;
  /** Absolute path the SVG was written to, when it was. */
  written?: string;
}

/**
 * Decide whether a run counts as a failure.
 *
 * Warnings are advisory by default. A wiring warning is often a deliberate choice the
 * author has already weighed, and failing a build over it would train people to stop
 * reading them; `--strict` is there for the pipelines that do want the gate.
 */
function exitCodeFor(diagnostics: readonly Diagnostic[], strict: boolean): number {
  const { errors, warnings } = summarize(diagnostics);
  if (errors > 0) return 1;
  return strict && warnings > 0 ? 1 : 0;
}

/**
 * Compile a `.khm` file and optionally write the SVG.
 *
 * @param file - Path to the source file.
 * @param options - Output path, strictness, colour and any compile overrides.
 * @returns The SVG, diagnostics, formatted report and exit code.
 */
export async function runBuild(
  file: string,
  options: BuildCommandOptions = {},
): Promise<BuildCommandResult> {
  const path = resolve(file);
  const source = await readFile(path, 'utf8');
  const { svg, diagnostics } = await compile(source, {
    resolver: createFileResolver(),
    path,
    ...options,
  });

  const report = options.quiet
    ? ''
    : formatReport(diagnostics, {
        file,
        source,
        ...(options.locale === undefined ? {} : { locale: options.locale }),
        ...(options.color === undefined ? {} : { color: options.color }),
      });

  const result: BuildCommandResult = {
    svg,
    diagnostics,
    report,
    exitCode: exitCodeFor(diagnostics, options.strict ?? false),
  };

  if (options.out !== undefined) {
    const target = resolve(options.out);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, svg, 'utf8');
    result.written = target;
  }

  return result;
}

/**
 * Validate a `.khm` file without producing output.
 *
 * @param file - Path to the source file.
 * @param options - Strictness, colour and any compile overrides.
 * @returns The diagnostics, formatted report and exit code.
 */
export async function runCheck(
  file: string,
  options: Omit<BuildCommandOptions, 'out'> = {},
): Promise<BuildCommandResult> {
  return runBuild(file, options);
}

/** How to lay a file out. */
export interface FormatCommandOptions extends FormatOptions {
  /** Write the result back to the file. Off to leave it alone and just report. */
  write?: boolean;
}

/** What a format produced. */
export interface FormatCommandResult {
  /** The formatted text. */
  content: string;
  /** Whether the file was not already in this shape. */
  changed: boolean;
  /** Absolute path written to, when one was. */
  written?: string;
}

/**
 * Lay a `.khm` file out.
 *
 * Reads and writes as a unit rather than streaming, because a formatter that half-writes a
 * file on failure costs more than one that is slow.
 *
 * @param file - Path to format.
 * @param options - Indent width, alignment, and whether to write back.
 * @returns The formatted text and whether it differed.
 */
export async function runFormat(
  file: string,
  options: FormatCommandOptions = {},
): Promise<FormatCommandResult> {
  const path = resolve(file);
  const source = await readFile(path, 'utf8');
  const content = formatSource(source, options);
  const changed = content !== source;

  const result: FormatCommandResult = { content, changed };
  if (options.write !== false && changed) {
    await writeFile(path, content, 'utf8');
    result.written = path;
  }
  return result;
}
