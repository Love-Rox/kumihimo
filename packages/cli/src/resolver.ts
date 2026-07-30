/**
 * Filesystem-backed module resolution for `use` declarations.
 */

import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { ModuleResolver, ResolvedModule } from '@love-rox/kumihimo-core';

/** Extensions tried when a `use` path has none. */
const EXTENSIONS = ['', '.khm'];

/**
 * Resolve `use` paths against the filesystem.
 *
 * Paths are relative to the file containing the `use`, not to the working directory, so
 * a library keeps working wherever the diagram that imports it is compiled from.
 *
 * @returns A resolver suitable for `compile`.
 */
export function createFileResolver(): ModuleResolver {
  return async (specifier: string, from: string): Promise<ResolvedModule | undefined> => {
    const base = from === '<input>' ? process.cwd() : dirname(resolve(from));
    const target = isAbsolute(specifier) ? specifier : resolve(base, specifier);

    for (const extension of EXTENSIONS) {
      const path = target + extension;
      try {
        return { path, source: await readFile(path, 'utf8') };
      } catch {
        // Try the next candidate; an unresolvable path is reported by the loader, which
        // knows the span to blame.
      }
    }
    return undefined;
  };
}
