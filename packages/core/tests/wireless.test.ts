import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { compile } from '../src/compile.js';
import { parse } from '../src/parser.js';
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
    expect(hit?.message).toContain('Put the transmitter or receiver in as a device');
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

describe('how many things can arrive at one end', () => {
  const build = (lines: readonly string[]) => {
    const parsed = parse(lines.join('\n'));
    const built = buildModel(parsed.document);
    return { ...built, diagnostics: [...parsed.diagnostics, ...built.diagnostics] };
  };

  it('lets an access point carry as many as reach it', () => {
    // Two cables do not go into one socket. A radio has no socket, and an access point
    // with five laptops on it is not overbooked — it is an access point.
    const { diagnostics } = build([
      'device ap "AP" as router { io W : wifi }',
      ...[1, 2, 3, 4, 5].map((n) => `device pc${n} "PC${n}" { io W : ndi }`),
      ...[1, 2, 3, 4, 5].map((n) => `pc${n}.W -> ap.W : ndi over wifi`),
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('lets two radio mics reach one receiver', () => {
    // The same thing without `over`: the signal is its own carrier and it is still air.
    const { diagnostics } = build([
      'device rx "RX" as interface  { in  W : uhf }',
      'device m1 "M1" as microphone { out W : uhf }',
      'device m2 "M2" as microphone { out W : uhf }',
      'm1.W -> rx.W : uhf [ch=1]',
      'm2.W -> rx.W : uhf [ch=2]',
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('still refuses two cables into one socket', () => {
    // The rule this relaxes is a fact about sockets, and it has to keep holding for them.
    const { diagnostics } = build([
      'device sw "SW" as switcher { in 1 : sdi }',
      'device a "A" as camera { out O : sdi }',
      'device b "B" as camera { out O : sdi }',
      'a.O -> sw.1 : sdi 5m',
      'b.O -> sw.1 : sdi 5m',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('port-overbooked');
  });

  it('goes by the carrier, not by the payload', () => {
    // `ndi over lan` is a cable however wireless-adjacent NDI sounds, so two of them into
    // one socket is still two cables into one socket.
    const { diagnostics } = build([
      'device sw "SW" as router { in 1 : lan }',
      'device a "A" as camera { out L : ndi }',
      'device b "B" as camera { out L : ndi }',
      'a.L -> sw.1 : ndi over lan 5m "N-01"',
      'b.L -> sw.1 : ndi over lan 5m "N-02"',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('port-overbooked');
  });
});
