/**
 * React hook compiling kumihimo source into SVG.
 *
 * Compiling is asynchronous — the layout engine is — so a component cannot simply return
 * a drawing. The hook owns that gap: it keeps the last good SVG on screen while a new one
 * is being produced, so typing in an editor does not make the diagram flash away and back.
 */

import { useEffect, useRef, useState } from 'react';

import type { CompileOptions, Diagnostic, Diagram } from '@love-rox/kumihimo-core';
import { compile } from '@love-rox/kumihimo-core';

/** What {@link useKumihimo} returns. */
export interface UseKumihimoResult {
  /** The rendered SVG, or an empty string before the first compile finishes. */
  svg: string;
  /** The resolved diagram, for callers that want the model as well as the picture. */
  diagram?: Diagram;
  /** Everything the compile had to say about the wiring. */
  diagnostics: readonly Diagnostic[];
  /** Whether a compile is in flight. The previous `svg` stays available meanwhile. */
  pending: boolean;
  /** Set when compiling threw, which should not happen for source-level problems. */
  error?: Error;
}

/**
 * Compile kumihimo source, re-running whenever it changes.
 *
 * @param source - The `.khm` text to compile.
 * @param options - Import resolution, severity, geometry and drawing overrides.
 * @returns The SVG, the model, diagnostics and progress state.
 */
export function useKumihimo(source: string, options: CompileOptions = {}): UseKumihimoResult {
  const [state, setState] = useState<Omit<UseKumihimoResult, 'pending'>>({
    svg: '',
    diagnostics: [],
  });
  const [pending, setPending] = useState(true);

  // Options are usually an inline object literal, so comparing by identity would recompile
  // on every render. Comparing by content is both cheaper and what the caller means.
  const key = JSON.stringify(options, (_, value: unknown) =>
    typeof value === 'function' ? undefined : value,
  );

  const latest = useRef(0);

  useEffect(() => {
    const run = ++latest.current;
    let cancelled = false;
    setPending(true);

    compile(source, options)
      .then((result) => {
        // A slower earlier compile must never overwrite a newer one.
        if (cancelled || run !== latest.current) return;
        setState({ svg: result.svg, diagram: result.diagram, diagnostics: result.diagnostics });
      })
      .catch((cause: unknown) => {
        if (cancelled || run !== latest.current) return;
        setState((previous) => ({
          ...previous,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        }));
      })
      .finally(() => {
        if (!cancelled && run === latest.current) setPending(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, key]);

  return { ...state, pending };
}
