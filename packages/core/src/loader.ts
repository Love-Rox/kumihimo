/**
 * Resolves `use` declarations into a single document.
 *
 * Reading files is deliberately not done here. The core runs unchanged in a browser, a
 * Markdown pipeline and a CLI, and only the CLI has a filesystem — so the caller supplies
 * a resolver and this module owns nothing but the graph walk.
 */

import type { Document, Statement } from './ast.js';
import type { Diagnostic, SeverityConfig } from './diagnostics.js';
import { DiagnosticBag } from './diagnostics.js';
import { parse } from './parser.js';

/** A file the resolver found. */
export interface ResolvedModule {
  /**
   * Canonical path of the file.
   *
   * Used both to detect a file already loaded and as the base for its own `use` paths,
   * so it must be stable for a given file however it was reached.
   */
  path: string;
  /** The file's text. */
  source: string;
}

/**
 * Turns a `use` path into a file.
 *
 * @param specifier - The path exactly as written in the `use` declaration.
 * @param from - Canonical path of the file containing the `use`, for relative resolution.
 * @returns The module, or `undefined` when it cannot be found.
 */
export type ModuleResolver = (
  specifier: string,
  from: string,
) => ResolvedModule | undefined | Promise<ResolvedModule | undefined>;

/** How to load a document. */
export interface LoadOptions {
  /** Canonical path of the entry source, used as the base for its `use` paths. */
  path?: string;
  /** How to find imported files. Without one, any `use` is unresolved. */
  resolver?: ModuleResolver;
  /** Per-rule severity overrides. */
  severities?: SeverityConfig;
}

/** What {@link loadDocument} returns. */
export interface LoadResult {
  /** The entry document with imported declarations prepended. */
  document: Document;
  /** Everything parsing and loading had to say. */
  diagnostics: readonly Diagnostic[];
  /** Canonical paths of every file loaded, entry first. */
  loaded: string[];
}

/**
 * Statement kinds a library contributes to the file that imports it.
 *
 * Devices, groups and connections stay behind on purpose: a library describes equipment
 * that exists in the world, not wiring that exists in this drawing. Importing someone
 * else's cables would be a surprise, so it is reported rather than done quietly.
 */
const IMPORTABLE = new Set<Statement['type']>(['model', 'signal', 'compat']);

/**
 * Parse a document and everything it pulls in with `use`.
 *
 * Each file is loaded at most once, so a diamond of imports costs nothing and a cycle
 * terminates instead of hanging.
 *
 * @param source - The entry file's text.
 * @param options - Entry path, resolver and severity configuration.
 * @returns The merged document, diagnostics, and the files that were read.
 */
export async function loadDocument(source: string, options: LoadOptions = {}): Promise<LoadResult> {
  const bag = new DiagnosticBag(options.severities ?? {});
  const entryPath = options.path ?? '<input>';
  const seen = new Set<string>([entryPath]);
  const loaded: string[] = [entryPath];
  const imported: Statement[] = [];

  const entry = parse(source);
  for (const diagnostic of entry.diagnostics) {
    bag.report(diagnostic.code, diagnostic.message, diagnostic.span);
  }

  const visit = async (document: Document, from: string): Promise<void> => {
    for (const statement of document.statements) {
      if (statement.type !== 'use') continue;

      if (!options.resolver) {
        bag.report(
          'unresolved-import',
          `取り込みを解決できません (resolver が指定されていません): ${statement.path}`,
          statement.span,
        );
        continue;
      }

      const module = await options.resolver(statement.path, from);
      if (!module) {
        bag.report('unresolved-import', `取り込めません: ${statement.path}`, statement.span);
        continue;
      }
      if (seen.has(module.path)) continue;
      seen.add(module.path);
      loaded.push(module.path);

      const parsed = parse(module.source);
      for (const diagnostic of parsed.diagnostics) {
        bag.report(diagnostic.code, `${module.path}: ${diagnostic.message}`, statement.span);
      }

      const dropped = parsed.document.statements.filter(
        (s) => s.type !== 'use' && !IMPORTABLE.has(s.type),
      );
      if (dropped.length > 0) {
        bag.report(
          'ignored-in-import',
          `${module.path} の ${dropped.map((s) => s.type).join(', ')} は取り込まれません。` +
            `use が取り込むのは model / signal / compat のみです`,
          statement.span,
        );
      }

      imported.push(...parsed.document.statements.filter((s) => IMPORTABLE.has(s.type)));
      await visit(parsed.document, module.path);
    }
  };

  await visit(entry.document, entryPath);

  return {
    document: {
      ...entry.document,
      // Imported declarations go first so a local one of the same name wins, matching the
      // rule everywhere else in the language: what you wrote here beats what you inherited.
      statements: [...imported, ...entry.document.statements],
    },
    diagnostics: bag.all,
    loaded,
  };
}
