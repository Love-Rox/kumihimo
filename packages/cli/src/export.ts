/**
 * The `export` subcommand: getting a diagram out in a form another tool can use.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type {
  CompileOptions,
  Diagnostic,
  Diagram,
  Locale,
  ScheduleKind,
} from '@love-rox/kumihimo-core';
import {
  SCHEDULES,
  SCHEDULE_KINDS,
  buildModel,
  loadDocument,
  renderDiagram,
  toDrawio,
  toTsv,
} from '@love-rox/kumihimo-core';

import { createFileResolver } from './resolver.js';

/** What a drawing can be turned into that is not a schedule. */
type PictureFormat = 'svg' | 'drawio';

/** Formats {@link runExport} can produce. */
export type ExportFormat = PictureFormat | ScheduleKind;

/**
 * Every format the CLI accepts, for help text and validation.
 *
 * The schedules come from the registry rather than being listed again here. A schedule
 * added to the language and missing from this list is one the CLI cannot export, and
 * nothing would have said so.
 */
export const EXPORT_FORMATS: readonly ExportFormat[] = ['svg', 'drawio', ...SCHEDULE_KINDS];

/**
 * File extension each format is normally written with.
 *
 * Built rather than listed: every schedule is a TSV, and a new one appearing with no
 * extension would be written to a file with none.
 */
export const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  svg: '.svg',
  drawio: '.drawio',
  ...Object.fromEntries(SCHEDULE_KINDS.map((kind) => [kind, '.tsv'])),
} as Readonly<Record<ExportFormat, string>>;

/** How to run an export. */
export interface ExportCommandOptions extends CompileOptions {
  /** Where to write. Omit to return the content without writing. */
  out?: string;
}

/** What an export produced. */
export interface ExportCommandResult {
  /** The exported content. */
  content: string;
  /** Everything the load and build stages had to say. */
  diagnostics: readonly Diagnostic[];
  /** Absolute path written to, when one was given. */
  written?: string;
}

/**
 * One schedule as TSV, straight off the registry.
 *
 * Every column the rows carry, in the order the registry lists them. A terminal export is
 * the one place that wants all of them: it is what gets pasted into a spreadsheet, and a
 * column dropped here is one nobody can get back.
 *
 * @param kind - Which schedule.
 * @param diagram - The resolved diagram.
 * @param locale - Language for the names inside the rows.
 * @returns A TSV document with a header row.
 */
function tsvOf(kind: ScheduleKind, diagram: Diagram, locale: Locale | undefined): string {
  const schedule = SCHEDULES[kind];
  return toTsv(
    schedule.rows(diagram, locale),
    schedule.columns.map((column) => column.key),
  );
}

/**
 * Export a `.khm` file in the requested format.
 *
 * @param file - Path to the source file.
 * @param format - What to produce.
 * @param options - Output path and any compile overrides.
 * @returns The content, diagnostics and the path written to.
 */
export async function runExport(
  file: string,
  format: ExportFormat,
  options: ExportCommandOptions = {},
): Promise<ExportCommandResult> {
  const path = resolve(file);
  const source = await readFile(path, 'utf8');

  const loaded = await loadDocument(source, {
    resolver: createFileResolver(),
    path,
    ...options,
  });
  const built = buildModel(loaded.document, options);
  const diagnostics = [...loaded.diagnostics, ...built.diagnostics];
  const { diagram } = built;

  // Pictures are their own thing; every schedule goes through the registry, which knows
  // its rows and its columns. Adding one to the language adds it here with no edit.
  const content =
    format === 'svg'
      ? await renderDiagram(diagram, options)
      : format === 'drawio'
        ? await toDrawio(diagram, options)
        : tsvOf(format, diagram, options.locale);

  const result: ExportCommandResult = { content, diagnostics };

  if (options.out !== undefined) {
    const target = resolve(options.out);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    result.written = target;
  }

  return result;
}
