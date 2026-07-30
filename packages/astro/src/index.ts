/**
 * Public API of `@love-rox/kumihimo-astro`.
 *
 * The integration renders code fences in Markdown and MDX. For `.astro` files, import the
 * component directly from `@love-rox/kumihimo-astro/Kumihimo.astro`.
 */

export type { AstroIntegration, KumihimoIntegrationOptions } from './integration.js';
export { kumihimoIntegration, default } from './integration.js';
