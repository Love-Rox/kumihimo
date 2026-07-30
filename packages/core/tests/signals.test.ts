import { describe, expect, it } from 'vitest';

import { BUILTIN_SIGNALS, createSignalRegistry, lookupSignal } from '../src/signals.js';

describe('signal registry', () => {
  it('resolves category defaults onto builtin signals', () => {
    const sdi = BUILTIN_SIGNALS['sdi'];
    expect(sdi).toBeDefined();
    expect(sdi?.category).toBe('video');
    expect(sdi?.color).toBe('#e11d48');
    expect(sdi?.style).toBe('solid');
  });

  it('marks network-borne transports as bidirectional', () => {
    expect(BUILTIN_SIGNALS['dante']?.bidirectional).toBe(true);
    expect(BUILTIN_SIGNALS['lan']?.bidirectional).toBe(true);
    expect(BUILTIN_SIGNALS['sdi']?.bidirectional).toBe(false);
  });

  it('lets a custom declaration override a builtin', () => {
    const sdi = BUILTIN_SIGNALS['sdi'];
    expect(sdi).toBeDefined();
    const registry = createSignalRegistry({
      sdi: { ...sdi!, color: '#000000' },
    });
    expect(lookupSignal(registry, 'sdi')?.color).toBe('#000000');
    // The builtin table itself must not be mutated.
    expect(BUILTIN_SIGNALS['sdi']?.color).toBe('#e11d48');
  });
});
