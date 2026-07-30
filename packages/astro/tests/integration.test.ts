import { describe, expect, it } from 'vitest';

import { kumihimoIntegration } from '../src/integration.js';

/** Capture what the integration hands to Astro's `updateConfig`. */
function setup(options?: Parameters<typeof kumihimoIntegration>[0]) {
  const captured: Record<string, unknown>[] = [];
  const integration = kumihimoIntegration(options);
  integration.hooks['astro:config:setup']?.({
    updateConfig: (config) => captured.push(config),
  });
  return { integration, captured };
}

describe('kumihimoIntegration', () => {
  it('identifies itself to Astro', () => {
    expect(kumihimoIntegration().name).toBe('@love-rox/kumihimo-astro');
  });

  it('registers the rehype plugin on the markdown pipeline', () => {
    const { captured } = setup();
    expect(captured).toHaveLength(1);
    const markdown = captured[0]!['markdown'] as { rehypePlugins: unknown[][] };
    expect(markdown.rehypePlugins).toHaveLength(1);
    expect(typeof markdown.rehypePlugins[0]![0]).toBe('function');
  });

  it('passes its options straight through to the plugin', () => {
    const { captured } = setup({ theme: 'dark', className: 'diagram' });
    const markdown = captured[0]!['markdown'] as { rehypePlugins: unknown[][] };
    expect(markdown.rehypePlugins[0]![1]).toMatchObject({ theme: 'dark', className: 'diagram' });
  });

  it('touches nothing else in the config', () => {
    const { captured } = setup();
    expect(Object.keys(captured[0]!)).toEqual(['markdown']);
  });
});
