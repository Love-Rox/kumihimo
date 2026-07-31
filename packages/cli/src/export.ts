/**
 * The `export` subcommand: getting a diagram out in a form another tool can use.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { CompileOptions, Diagnostic } from '@love-rox/kumihimo-core';
import {
  adapterSchedule,
  buildModel,
  cableSchedule,
  equipmentSchedule,
  loadDocument,
  renderDiagram,
  toDrawio,
  toTsv,
} from '@love-rox/kumihimo-core';

import { createFileResolver } from './resolver.js';

/** Formats {@link runExport} can produce. */
export type ExportFormat = 'svg' | 'drawio' | 'cable' | 'equipment' | 'adapter';

/** Every format the CLI accepts, for help text and validation. */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  'svg',
  'drawio',
  'cable',
  'equipment',
  'adapter',
];

/** File extension each format is normally written with. */
export const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  svg: '.svg',
  drawio: '.drawio',
  cable: '.tsv',
  equipment: '.tsv',
  adapter: '.tsv',
};

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

const CABLE_COLUMNS = [
  'label',
  'fromDevice',
  'from',
  'toDevice',
  'to',
  'signalLabel',
  'medium',
  'length',
  'frequency',
  'color',
  'connectors',
  'adapter',
  'note',
] as const;

const EQUIPMENT_COLUMNS = ['id', 'label', 'kind', 'group', 'ports', 'meta', 'implicit'] as const;
const ADAPTER_COLUMNS = ['adapter', 'count', 'links'] as const;

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

  const content =
    format === 'svg'
      ? await renderDiagram(diagram, options)
      : format === 'drawio'
        ? await toDrawio(diagram, options)
        : format === 'cable'
          ? toTsv(cableSchedule(diagram, options.locale), CABLE_COLUMNS)
          : format === 'equipment'
            ? toTsv(equipmentSchedule(diagram), EQUIPMENT_COLUMNS)
            : toTsv(adapterSchedule(diagram, options.locale), ADAPTER_COLUMNS);

  const result: ExportCommandResult = { content, diagnostics };

  if (options.out !== undefined) {
    const target = resolve(options.out);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    result.written = target;
  }

  return result;
}
