import { describe, expect, it } from 'vitest';

import { checkCompatibility } from '../src/compatibility.js';
import { BUILTIN_SIGNALS } from '../src/signals.js';

function sig(name: string) {
  const s = BUILTIN_SIGNALS[name];
  if (!s) throw new Error(`missing builtin signal: ${name}`);
  return s;
}

describe('interchangeable signals', () => {
  it('accepts identical signal types', () => {
    expect(checkCompatibility(sig('sdi'), sig('sdi')).verdict).toBe('ok');
  });

  it('accepts Dante and NDI patched into an Ethernet port', () => {
    expect(checkCompatibility(sig('dante'), sig('lan')).verdict).toBe('ok');
    expect(checkCompatibility(sig('ndi'), sig('lan')).verdict).toBe('ok');
  });

  it('accepts XLR into a TRS input', () => {
    expect(checkCompatibility(sig('xlr'), sig('trs')).verdict).toBe('ok');
  });

  it('does not make ADAT and S/PDIF equivalent via optical', () => {
    // Both share a group with `optical`, but groups are transitive only within
    // themselves — TOSLINK carries either protocol, neither understands the other.
    expect(checkCompatibility(sig('optical'), sig('adat')).verdict).toBe('ok');
    expect(checkCompatibility(sig('optical'), sig('spdif')).verdict).toBe('ok');
    expect(checkCompatibility(sig('adat'), sig('spdif')).verdict).toBe('incompatible');
  });
});

describe('connector confusions', () => {
  it('rejects HDBaseT patched into a network switch', () => {
    const r = checkCompatibility(sig('hdbaset'), sig('lan'));
    expect(r.verdict).toBe('incompatible');
    expect(r.reason).toContain('Ethernet ではない');
  });

  it('rejects analogue RCA into an S/PDIF input', () => {
    expect(checkCompatibility(sig('rca'), sig('spdif')).verdict).toBe('incompatible');
  });

  it('rejects DMX into an audio XLR input', () => {
    expect(checkCompatibility(sig('dmx'), sig('xlr')).verdict).toBe('incompatible');
  });

  it('rejects SDI into a genlock reference input', () => {
    expect(checkCompatibility(sig('sdi'), sig('genlock')).verdict).toBe('incompatible');
  });

  it('is not silenced by declaring an adapter', () => {
    const r = checkCompatibility(sig('hdbaset'), sig('lan'), { hasAdapter: true });
    expect(r.verdict).toBe('incompatible');
    expect(r.reason).toContain('変換器を機器として配置');
  });
});

describe('passive adapters', () => {
  it('warns and names the cable when the adapter is undeclared', () => {
    const r = checkCompatibility(sig('hdmi'), sig('dvi'));
    expect(r.verdict).toBe('lossy');
    expect(r.adapter).toBe('HDMI-DVI 変換ケーブル');
    expect(r.reason).toContain('via');
  });

  it('clears once the adapter is declared, but still reports the part', () => {
    const r = checkCompatibility(sig('hdmi'), sig('dvi'), { hasAdapter: true });
    expect(r.verdict).toBe('ok');
    expect(r.adapter).toBe('HDMI-DVI 変換ケーブル');
  });

  it('treats DisplayPort passive conversion as one-way', () => {
    expect(checkCompatibility(sig('dp'), sig('hdmi')).adapter).toBeDefined();
    // An HDMI source cannot passively drive a DisplayPort input.
    expect(checkCompatibility(sig('hdmi'), sig('dp')).verdict).toBe('incompatible');
  });
});

describe('lossy pairs', () => {
  it('warns when going balanced to unbalanced', () => {
    const r = checkCompatibility(sig('xlr'), sig('rca'));
    expect(r.verdict).toBe('lossy');
    expect(r.reason).toContain('バランス→アンバランス');
  });

  it('warns both ways on AES over analogue XLR', () => {
    expect(checkCompatibility(sig('aes'), sig('xlr')).verdict).toBe('lossy');
    expect(checkCompatibility(sig('xlr'), sig('aes')).verdict).toBe('lossy');
  });
});

describe('author overrides', () => {
  const houseStandard = [
    {
      from: 'aes',
      to: 'xlr',
      verdict: 'ok' as const,
      reason: '社内標準: 10m 以下のみ許容',
    },
  ];

  it('lets a compat rule swing a builtin verdict, carrying its rationale', () => {
    const r = checkCompatibility(sig('aes'), sig('xlr'), { overrides: houseStandard });
    expect(r.verdict).toBe('ok');
    expect(r.reason).toBe('社内標準: 10m 以下のみ許容');
  });

  it('applies symmetrically by default', () => {
    expect(checkCompatibility(sig('xlr'), sig('aes'), { overrides: houseStandard }).verdict).toBe(
      'ok',
    );
  });

  it('outranks a connector confusion when the author insists', () => {
    const r = checkCompatibility(sig('hdbaset'), sig('lan'), {
      overrides: [{ from: 'hdbaset', to: 'lan', verdict: 'ok', reason: '専用線として敷設済み' }],
    });
    expect(r.verdict).toBe('ok');
  });
});

describe('fallback', () => {
  it('rejects SDI into HDMI and points at an active converter', () => {
    const r = checkCompatibility(sig('sdi'), sig('hdmi'));
    expect(r.verdict).toBe('incompatible');
    expect(r.reason).toContain('変換器を機器として配置');
  });
});
