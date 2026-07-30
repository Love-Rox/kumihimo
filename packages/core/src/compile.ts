/**
 * The whole pipeline in one call: text in, SVG out.
 */

import type { BuildOptions } from './build.js';
import { buildModel } from './build.js';
import type { Diagnostic } from './diagnostics.js';
import type { LoadOptions } from './loader.js';
import { loadDocument } from './loader.js';
import type { Diagram } from './model.js';
import type { RenderOptions } from './render.js';
import { renderDiagram } from './render.js';

/** How to compile. */
export interface CompileOptions extends BuildOptions, RenderOptions, LoadOptions {}

/** What {@link compile} returns. */
export interface CompileResult {
  /** The rendered SVG document. */
  svg: string;
  /** The resolved diagram, for callers that want the model as well as the picture. */
  diagram: Diagram;
  /** Everything the load and build stages had to say. */
  diagnostics: readonly Diagnostic[];
  /** Canonical paths of every file read, entry first. Useful for watch mode. */
  loaded: string[];
}

/**
 * Compile kumihimo source into an SVG diagram.
 *
 * Never throws, and always produces a drawing. Diagnostics describe what is wrong with
 * the wiring; they do not prevent the diagram from rendering, because a picture of a
 * flawed system is exactly what an author needs in order to see the flaw.
 *
 * @param source - The `.khm` text to compile.
 * @param options - Import resolution, severity, geometry and drawing overrides.
 * @returns The SVG, the model behind it, the files read, and any diagnostics.
 */
export async function compile(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const loaded = await loadDocument(source, options);
  const built = buildModel(loaded.document, options);
  const svg = await renderDiagram(built.diagram, options);
  return {
    svg,
    diagram: built.diagram,
    diagnostics: [...loaded.diagnostics, ...built.diagnostics],
    loaded: loaded.loaded,
  };
}
