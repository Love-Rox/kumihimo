/**
 * Astro integration wiring kumihimo into the Markdown and MDX pipelines.
 *
 * Everything happens at build time, so a page that embeds a diagram ships static SVG and
 * no JavaScript at all — no layout engine in the browser bundle, nothing to hydrate.
 */

import type { RehypeKumihimoOptions } from '@love-rox/kumihimo-rehype';
import { rehypeKumihimo } from '@love-rox/kumihimo-rehype';

/**
 * The slice of Astro's integration API this needs.
 *
 * Declared structurally rather than imported so `astro` stays a peer dependency and this
 * package does not force a version on the host project.
 */
export interface AstroIntegration {
  /** Name shown in Astro's build output. */
  name: string;
  /** Lifecycle hooks. */
  hooks: {
    /** Called once as the config is being assembled. */
    'astro:config:setup'?: (context: {
      updateConfig: (config: Record<string, unknown>) => void;
    }) => void;
  };
}

/** How the integration behaves. */
export interface KumihimoIntegrationOptions extends RehypeKumihimoOptions {}

/**
 * Render kumihimo code fences in Markdown and MDX into inline SVG.
 *
 * @example
 * ```js
 * import kumihimo from '@love-rox/kumihimo-astro';
 *
 * export default defineConfig({
 *   integrations: [kumihimo({ theme: 'dark' })],
 * });
 * ```
 *
 * @param options - Languages to match, wrapper class, diagnostics hook and any compile
 *   overrides such as `theme`.
 * @returns An Astro integration.
 */
export function kumihimoIntegration(options: KumihimoIntegrationOptions = {}): AstroIntegration {
  return {
    name: '@love-rox/kumihimo-astro',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          markdown: {
            rehypePlugins: [[rehypeKumihimo, options]],
          },
        });
      },
    },
  };
}

export default kumihimoIntegration;
