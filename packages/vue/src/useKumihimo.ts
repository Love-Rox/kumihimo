/**
 * Vue composable compiling kumihimo source into SVG.
 *
 * Compiling is asynchronous — the layout engine is — so the last good SVG is kept on
 * screen while a new one is produced. Typing in an editor should not make the diagram
 * flash away and back.
 */

import type { MaybeRefOrGetter, Ref } from 'vue';
import { ref, toValue, watchEffect } from 'vue';

import type { CompileOptions, Diagnostic, Diagram } from '@love-rox/kumihimo-core';
import { compile } from '@love-rox/kumihimo-core';

/** What {@link useKumihimo} returns. */
export interface UseKumihimoResult {
  /** The rendered SVG, empty until the first compile finishes. */
  svg: Ref<string>;
  /** The resolved diagram, for callers that want the model as well as the picture. */
  diagram: Ref<Diagram | undefined>;
  /** Everything the compile had to say about the wiring. */
  diagnostics: Ref<readonly Diagnostic[]>;
  /** Whether a compile is in flight. The previous `svg` stays available meanwhile. */
  pending: Ref<boolean>;
  /** Set when compiling threw, which should not happen for source-level problems. */
  error: Ref<Error | undefined>;
}

/**
 * Compile kumihimo source, re-running whenever it or the options change.
 *
 * @param source - The `.khm` text, as a value, ref or getter.
 * @param options - Compile options, as a value, ref or getter.
 * @returns Reactive SVG, model, diagnostics and progress state.
 */
export function useKumihimo(
  source: MaybeRefOrGetter<string>,
  options: MaybeRefOrGetter<CompileOptions> = {},
): UseKumihimoResult {
  const svg = ref('');
  const diagram = ref<Diagram | undefined>(undefined) as Ref<Diagram | undefined>;
  const diagnostics = ref<readonly Diagnostic[]>([]) as Ref<readonly Diagnostic[]>;
  const pending = ref(true);
  const error = ref<Error | undefined>(undefined);

  let latest = 0;

  watchEffect(() => {
    const text = toValue(source);
    const config = toValue(options);
    const run = ++latest;
    pending.value = true;

    compile(text, config)
      .then((result) => {
        // A slower earlier compile must never overwrite a newer one.
        if (run !== latest) return;
        svg.value = result.svg;
        diagram.value = result.diagram;
        diagnostics.value = result.diagnostics;
        error.value = undefined;
      })
      .catch((cause: unknown) => {
        if (run !== latest) return;
        error.value = cause instanceof Error ? cause : new Error(String(cause));
      })
      .finally(() => {
        if (run === latest) pending.value = false;
      });
  });

  return { svg, diagram, diagnostics, pending, error };
}
