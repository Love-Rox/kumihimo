/**
 * `over` — what is riding, and what it is riding on.
 *
 * A port is a piece of physics: an RJ45 socket, a radio. What travels through it is chosen
 * per run — NDI today, Dante tomorrow. Without a way to say that, the language needed one
 * signal type per combination, and a wireless camera wanted a `wireless-ndi` that would
 * have been followed by a wireless-dante and the rest.
 *
 * The split under test: the **carrier** decides the physics — connector, cable or air,
 * length or channel, whether the ends can meet — and the **payload** is what the drawing
 * is about.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { renderDiagram } from '../src/render.js';
import { cableSchedule, wirelessSchedule } from '../src/schedule.js';

const STUDIO = [
  'device cam "PTZ" as camera   { out WIFI : wifi }',
  'device ap  "AP"  as router   { io WIFI : wifi  out LAN : lan }',
  'device pc  "PC"  as computer { in LAN : lan }',
  'device dsk "Desk" as mixer   { in DANTE : lan }',
  'cam.WIFI -> ap.WIFI   : ndi over wifi [ch=36]',
  'ap.LAN   -> pc.LAN    : ndi over lan 10m "N-01"',
  'ap.LAN   -> dsk.DANTE : dante over lan 15m "N-02"',
];

function build(lines: readonly string[]) {
  const { document, diagnostics: parsed } = parse(lines.join('\n'));
  const { diagram, diagnostics: built } = buildModel(document);
  return { diagram, diagnostics: [...parsed, ...built] };
}

describe('what it says', () => {
  it('compiles a wireless camera and a Dante run over the same fabric', () => {
    expect(build(STUDIO).diagnostics).toEqual([]);
  });

  it('keeps the payload as the signal and the carrier beside it', () => {
    const { diagram } = build(STUDIO);
    const [air, wire] = diagram.links;
    expect(air?.signal.name).toBe('ndi');
    expect(air?.carrier?.name).toBe('wifi');
    expect(wire?.signal.name).toBe('ndi');
    expect(wire?.carrier?.name).toBe('lan');
  });

  it('leaves an ordinary run without a carrier, so the field means something', () => {
    const { diagram } = build([
      'device a as camera   { out SDI : sdi }',
      'device b as recorder { in  SDI : sdi }',
      'a.SDI -> b.SDI : sdi 30m',
    ]);
    expect(diagram.links[0]?.carrier).toBeUndefined();
  });
});

describe('the carrier decides the physics', () => {
  it('gives the same signal a channel through the air and a length down a cable', () => {
    // The two hops carry the same payload and land on different sheets, which is the
    // clearest statement of what `over` does: the carrier decides, not the payload.
    const { diagram } = build(STUDIO);

    const air = wirelessSchedule(diagram);
    expect(air).toHaveLength(1);
    expect(air[0]).toMatchObject({ signal: 'ndi', carrier: 'wifi', frequency: 'ch 36' });

    const cables = cableSchedule(diagram);
    expect(cables[0]).toMatchObject({ signal: 'ndi', length: '10m' });
  });

  it('does not put a connector on a radio hop', () => {
    // `ndi` lists RJ45. Read off the payload, the drawing claimed an RJ45 on the hop
    // through the air — a connector nobody will find on it. Now the hop is not among the
    // cables at all, which is the same claim made once rather than twice.
    const { diagram } = build(STUDIO);
    const cables = cableSchedule(diagram);
    expect(cables.map((r) => r.from)).not.toContain('cam.WIFI');
    expect(cables[0]?.connectors).toEqual(['RJ45']);
  });

  it('judges whether the ends can meet by the carrier', () => {
    const { diagnostics } = build([
      'device a as camera { out W : wifi }',
      'device b as router { in  L : lan }',
      'a.W -> b.L : ndi over wifi',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('signal-mismatch');
  });

  it('reports a length on a run that is through the air', () => {
    const { diagnostics } = build([
      'device a as camera { out W : wifi }',
      'device b as router { io  W : wifi }',
      'a.W -> b.W : ndi over wifi 10m',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
  });

  it('reports a channel on a run that is down a cable', () => {
    // The mirror rule, which was missing: a length on a radio path has been reported since
    // the beginning, but a channel on a cable was read by nothing and said nothing.
    const { diagnostics } = build([
      'device a as camera { out L : lan }',
      'device b as router { in  L : lan }',
      'a.L -> b.L : ndi over lan [ch=36]',
    ]);
    const hit = diagnostics.find((d) => d.code === 'invalid-value');
    expect(hit?.message).toContain('ch=36');
  });

  it('reports a carrier nobody declared', () => {
    const { diagnostics } = build([
      'device a as camera { out L : lan }',
      'device b as router { in  L : lan }',
      'a.L -> b.L : ndi over nonsense',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('unknown-signal');
  });
});

describe('the drawing', () => {
  it('names the payload in the key, not the carrier', async () => {
    // Two runs of NDI and one of Dante, over two different fabrics. What a reader needs
    // from the key is which stream, not which cable.
    const svg = await renderDiagram(build(STUDIO).diagram, { locale: 'en' });
    expect(svg).toContain('>NDI<');
    expect(svg).toContain('>Dante<');
    expect(svg).not.toContain('>Wi-Fi<');
  });

  it('marks the hop through the air as wireless', async () => {
    // The glyph comes from the carrier. Read off the payload, an NDI hop over Wi-Fi was
    // drawn as an ordinary cable.
    const air = await renderDiagram(build(STUDIO).diagram);
    const wired = await renderDiagram(
      build([
        'device a as camera { out L : lan }',
        'device b as router { in  L : lan }',
        'a.L -> b.L : ndi over lan 5m',
      ]).diagram,
    );
    // The broadcast mark is drawn only on a radio path.
    expect(air).toContain('a 9 9 0 0 0');
    expect(wired).not.toContain('a 9 9 0 0 0');
  });
});

describe('a port that declares the carrier', () => {
  // Reported from use: `ndi over wifi` into a port declared `wifi` was told to put in a
  // transmitter — the access point it was already plugged into. The check compared the
  // payload against the carrier, found air meeting copper, and asked for the thing that
  // was there. `over` says those two belong together; a socket for the carrier is the
  // right socket.
  const AP = [
    'device pc  "PC" as computer { out WIFI : ndi }',
    'device ap  "AP" as router   { io  WIFI : wifi  io LAN : lan }',
    'device rec "REC" as recorder { in LAN : ndi }',
    'pc.WIFI -> ap.WIFI : ndi over wifi',
    'ap.LAN  -> rec.LAN : ndi over lan 10m "N-01"',
  ];

  it('is right rather than mismatched', () => {
    expect(build(AP).diagnostics).toEqual([]);
  });

  it('still wants a receiver when nothing says they belong together', () => {
    // Without `over`, `ndi` into a `wifi` socket is exactly the mistake the check exists
    // for, and it has to keep catching it.
    const bare = AP.map((l) => l.replace(' over wifi', ''));
    expect(build(bare).diagnostics.map((d) => d.code)).toContain('signal-mismatch');
  });

  it('still judges an end that is neither the payload nor the carrier', () => {
    // `over wifi` does not make every socket acceptable — only a socket for the carrier.
    const wrong = [
      'device pc "PC" as computer { out WIFI : ndi }',
      'device r  "R"  as recorder { in  SDI  : sdi }',
      'pc.WIFI -> r.SDI : ndi over wifi',
    ];
    expect(build(wrong).diagnostics.map((d) => d.code)).toContain('signal-mismatch');
  });

  it('leaves the drawing naming the payload', () => {
    // The end resolves to the payload for the *check* only. What the run is called, and
    // what colour it takes, still come from what is riding.
    const { diagram } = build(AP);
    expect(diagram.links[0]?.signal.name).toBe('ndi');
    expect(diagram.links[0]?.carrier?.name).toBe('wifi');
  });
});
