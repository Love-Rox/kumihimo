/**
 * NDI over the air, and the diagnostic that was missing beside it.
 *
 * The language could describe a radio path carrying audio, video or DMX, and a cabled NDI
 * run — but not the arrangement people actually build, which is NDI over wireless. Writing
 * that as `wifi` compiles, and loses the thing a reader wants from the drawing: what is
 * flying through the air.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { renderDiagram } from '../src/render.js';
import { cableSchedule } from '../src/schedule.js';
import { BUILTIN_SIGNALS } from '../src/signals.js';

const WIRELESS_NDI = [
  'device cam "PTZ" as camera { out NDI : wireless-ndi }',
  'device ap  "AP"  as router {',
  '  io  WIFI : wireless-ndi',
  '  out LAN  : ndi',
  '}',
  'device pc  "PC"  as computer { in NDI : ndi }',
  'cam.NDI -> ap.WIFI : wireless-ndi [ch=36]',
  'ap.LAN  -> pc.NDI  : ndi 10m "N-01"',
];

function build(lines: readonly string[]) {
  const { document, diagnostics: parsed } = parse(lines.join('\n'));
  const { diagram, diagnostics: built } = buildModel(document);
  return { diagram, diagnostics: [...parsed, ...built] };
}

describe('the type', () => {
  it('is a radio path with no connector', () => {
    const signal = BUILTIN_SIGNALS['wireless-ndi'];
    expect(signal?.wireless).toBe(true);
    expect(signal?.connectors).toEqual([]);
    // Video, like `ndi` itself — the drawing is about pictures, not about the network.
    expect(signal?.category).toBe('video');
  });

  it('draws a whole wireless-camera path without complaint', () => {
    expect(build(WIRELESS_NDI).diagnostics).toEqual([]);
  });

  it('keeps the two halves apart on the schedule', () => {
    // The air has a channel and nothing to coil; the cable has a length and a number.
    const rows = cableSchedule(build(WIRELESS_NDI).diagram);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ medium: 'wireless', frequency: 'ch 36' });
    expect(rows[0]?.length).toBeUndefined();
    expect(rows[1]).toMatchObject({ medium: 'cable', length: '10m', label: 'N-01' });
  });

  it('says which is which in the key', async () => {
    // Written as `wifi` the drawing would say only "Wi-Fi", and a reader would not know
    // whether it carries the programme feed or somebody's laptop.
    const svg = await renderDiagram(build(WIRELESS_NDI).diagram, { locale: 'en' });
    expect(svg).toContain('Wireless NDI');
    expect(svg).toContain('>NDI<');
  });

  it('still refuses to meet a cable directly', async () => {
    const { diagnostics } = build([
      'device cam as camera   { out NDI : wireless-ndi }',
      'device sw  as router   { in 1 : ndi }',
      'cam.NDI -> sw.1 : wireless-ndi',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('signal-mismatch');
  });
});

describe('a channel written on a cable', () => {
  it('is reported', () => {
    // The mirror of a rule that has been there since the beginning — a length on a radio
    // path is an error. A channel on a cable was read by nothing and said nothing, so a
    // line copied from the wireless half of a drawing looked fine and meant nothing.
    const { diagnostics } = build([
      'device cam as camera   { out NDI : ndi }',
      'device pc  as computer { in NDI : ndi }',
      'cam.NDI -> pc.NDI : ndi [ch=36]',
    ]);
    const hit = diagnostics.find((d) => d.code === 'invalid-value');
    expect(hit?.message).toContain('ch=36');
  });

  it('is reported for a frequency too', () => {
    const { diagnostics } = build([
      'device a as generic { out X : sdi }',
      'device b as generic { in Y : sdi }',
      `a.X -> b.Y : sdi [freq="2.4GHz"]`,
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
  });

  it('leaves a channel on a radio path alone', () => {
    const { diagnostics } = build([
      'device a as transmitter { out RF : uhf }',
      'device b as receiver    { in  RF : uhf }',
      'a.RF -> b.RF : uhf [ch=38]',
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('leaves other attributes alone', () => {
    const { diagnostics } = build([
      'device a as generic { out X : sdi }',
      'device b as generic { in Y : sdi }',
      'a.X -> b.Y : sdi [color=blue]',
    ]);
    expect(diagnostics).toEqual([]);
  });
});
