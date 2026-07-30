import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { BUILTIN_SIGNALS } from '../src/signals.js';

const WIRELESS = `
device mic  "ワイヤレスマイク" as microphone { out RF : uhf }
device rx   "受信機"           as interface  { in RF : uhf  out CH1 : xlr }
device mixer "卓"              as mixer      { in CH1 : xlr }
mic.RF -> rx.RF   : uhf [ch=38]
rx.CH1 -> mixer.CH1 : xlr 3m "A-01"
`;

describe('wireless signals', () => {
  it('marks the over-the-air signals and leaves cabled ones alone', () => {
    expect(BUILTIN_SIGNALS['wifi']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['bluetooth']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['uhf']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['iem']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['wireless-video']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['wireless-dmx']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['ir']?.wireless).toBe(true);
    expect(BUILTIN_SIGNALS['sdi']?.wireless).toBe(false);
    expect(BUILTIN_SIGNALS['lan']?.wireless).toBe(false);
  });

  it('keeps a wireless signal in its content family, not a family of its own', () => {
    // Wireless video is still video; only the medium differs, and the drawing should
    // still read as a video path.
    expect(BUILTIN_SIGNALS['wireless-video']?.category).toBe('video');
    expect(BUILTIN_SIGNALS['uhf']?.category).toBe('audio');
    expect(BUILTIN_SIGNALS['wifi']?.category).toBe('network');
  });

  it('gives wireless signals no connectors to order', () => {
    expect(BUILTIN_SIGNALS['wifi']?.connectors).toEqual([]);
    expect(BUILTIN_SIGNALS['uhf']?.connectors).toEqual([]);
  });
});

describe('wireless validation', () => {
  it('accepts a properly received wireless path', async () => {
    const { diagnostics } = await compile(WIRELESS);
    expect(diagnostics).toEqual([]);
  });

  it('rejects wireless wired straight into a cabled input', async () => {
    const { diagnostics } = await compile(`
      device mic   as microphone { out RF  : uhf }
      device mixer as mixer      { in  CH1 : xlr }
      mic.RF -> mixer.CH1
    `);
    const hit = diagnostics.find((d) => d.code === 'signal-mismatch');
    expect(hit?.message).toContain('送受信機を機器として配置');
  });

  it('rejects Wi-Fi patched into a network switch', async () => {
    const { diagnostics } = await compile(`
      device ap as router { io WIFI : wifi }
      device sw as router { io 1..8 : lan }
      ap.WIFI -> sw.1
    `);
    expect(diagnostics.some((d) => d.code === 'signal-mismatch')).toBe(true);
  });

  it('rejects a cable length on a radio path and drops it', async () => {
    const { diagram, diagnostics } = await compile(`
      device a as generic { out RF : uhf }
      device b as generic { in  RF : uhf }
      a.RF -> b.RF : uhf 30m
    `);
    expect(diagnostics.some((d) => d.code === 'invalid-value')).toBe(true);
    expect(diagram.links[0]?.length).toBeUndefined();
  });

  it('rejects an adapter on a radio path', async () => {
    const { diagram, diagnostics } = await compile(`
      device a as generic { out RF : uhf }
      device b as generic { in  RF : uhf }
      a.RF -> b.RF : uhf via "変換ケーブル"
    `);
    expect(diagnostics.some((d) => d.code === 'invalid-value')).toBe(true);
    expect(diagram.links[0]?.via).toBeUndefined();
  });

  it('records a frequency and a channel where a cable would record length', async () => {
    const freq = await compile('a.X -> b.Y : wifi [freq="5GHz"]');
    expect(freq.diagram.links[0]?.frequency).toBe('5GHz');
    const ch = await compile('a.X -> b.Y : uhf [ch=38]');
    expect(ch.diagram.links[0]?.frequency).toBe('ch 38');
  });
});

describe('wireless rendering', () => {
  it('draws a broadcast mark on a radio path', async () => {
    const { svg } = await compile(WIRELESS);
    // The glyph is the only filled circle of that radius in the document.
    expect(svg).toContain('r="1.7"');
  });

  it('leaves a fully cabled diagram unmarked', async () => {
    const { svg } = await compile(`
      device a as generic { out X : sdi }
      device b as generic { in  Y : sdi }
      a.X -> b.Y : sdi 3m
    `);
    expect(svg).not.toContain('r="1.7"');
  });

  it('dashes a radio path even when its family draws solid', async () => {
    // Wireless video is a video signal, and video is solid — but over the air it must
    // never read as a cable.
    const { svg } = await compile(`
      device a as camera    { out RF : wireless-video }
      device b as converter { in  RF : wireless-video }
      a.RF -> b.RF
    `);
    const cable = svg.match(/<polyline[^>]*marker-end[^>]*\/>/)?.[0] ?? '';
    expect(cable).toContain('stroke-dasharray');
  });

  it('shows the frequency where a cable would show its length', async () => {
    const { svg } = await compile('a.X -> b.Y : wifi [freq="5GHz"]');
    expect(svg).toContain('5GHz');
  });
});
