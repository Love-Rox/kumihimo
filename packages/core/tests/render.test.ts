import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { compile } from '../src/compile.js';
import { layoutDiagram } from '../src/layout.js';
import { parse } from '../src/parser.js';
import { legibleScale, renderDiagram } from '../src/render.js';
import { THEMES } from '../src/theme.js';

const STUDIO = `
diagram "テスト系統図" { direction: LR }

group stage "ステージ" {
  device cam "カメラ" as camera     { out SDI : sdi }
  device mic "マイク" as microphone { out OUT : xlr }
}

group rack "ラック" {
  device sw  "スイッチャー" as switcher { in 1..4 : sdi  out PGM : sdi }
  device rec "レコーダー"   as recorder { in SDI : sdi }
  device mx  "ミキサー"     as mixer    { in CH[1..8] : xlr }
}

cam.SDI -> sw.1     : sdi 30m "V-01"
sw.PGM  -> rec.SDI  : sdi 2m  "V-10"
mic.OUT -> mx.CH1   : xlr 20m "A-01"
`;

async function layoutOf(source: string) {
  const { diagram } = buildModel(parse(source).document);
  return { diagram, layout: await layoutDiagram(diagram) };
}

describe('layout', () => {
  it('places every device and routes every link', async () => {
    const { layout } = await layoutOf(STUDIO);
    expect(layout.devices).toHaveLength(5);
    expect(layout.groups).toHaveLength(2);
    expect(layout.edges).toHaveLength(3);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('puts inputs and outputs on opposite faces when flowing left to right', async () => {
    const { layout } = await layoutOf('device d { in A : sdi  out B : sdi }');
    const ports = layout.devices[0]!.ports;
    expect(ports.find((p) => p.name === 'A')?.side).toBe('WEST');
    expect(ports.find((p) => p.name === 'B')?.side).toBe('EAST');
  });

  it('puts a bidirectional port on the side it is actually used on', async () => {
    // `io` says a port *can* go either way, not that it does. Which one it is in this
    // drawing is written down already, in the runs that touch it.
    const { layout } = await layoutOf(
      [
        'device cam "Camera" as camera { out W : ndi }',
        'device ap "AP" as router { io W : ndi  out LAN : ndi }',
        'device pc "PC" as recorder { in LAN : ndi }',
        'cam.W  -> ap.W   : ndi 10m',
        'ap.LAN -> pc.LAN : ndi 20m',
      ].join('\n'),
    );
    const ap = layout.devices.find((d) => d.id === 'ap')!;
    // Nothing leaves by W, so drawing it on the outgoing face sent every run that reached
    // it around the box.
    expect(ap.ports.find((p) => p.name === 'W')?.side).toBe('WEST');
    expect(ap.ports.find((p) => p.name === 'LAN')?.side).toBe('EAST');
  });

  it('leaves a bidirectional port on the outgoing face when it is used both ways', async () => {
    // A switch really is ambiguous, and a stable default beats a coin toss.
    const { layout } = await layoutOf(
      [
        'device a "A" as computer { out L : lan }',
        'device sw "SW" as router { io 1 : lan }',
        'device b "B" as computer { in L : lan }',
        'a.L  -> sw.1 : lan 5m',
        'sw.1 -> b.L  : lan 5m',
      ].join('\n'),
    );
    expect(layout.devices.find((d) => d.id === 'sw')!.ports[0]?.side).toBe('EAST');
  });

  it('leaves a bidirectional port on the outgoing face when nothing is connected', async () => {
    // Nothing to read, so nothing to go on.
    const { layout } = await layoutOf('device d { io A : dante }');
    expect(layout.devices[0]!.ports[0]?.side).toBe('EAST');
  });

  it('keeps ports in declaration order', async () => {
    const { layout } = await layoutOf('device d { in 1..4 : sdi }');
    const ys = layout.devices[0]!.ports.map((p) => p.center.y);
    expect(ys).toEqual(ys.toSorted((a, b) => a - b));
  });

  it('reports absolute coordinates for links that stay inside one group', async () => {
    // ELK expresses edge geometry in the coordinate system of whichever node holds the
    // edge, so a group-internal link is the case that silently comes back offset.
    const { layout } = await layoutOf(STUDIO);
    const inner = layout.edges.find((e) => e.id.startsWith('sw.PGM->rec.SDI'));
    const sw = layout.devices.find((d) => d.id === 'sw')!;
    const rec = layout.devices.find((d) => d.id === 'rec')!;
    expect(inner).toBeDefined();

    const start = inner!.points[0]!;
    const end = inner!.points.at(-1)!;
    // The route must actually touch the boxes it claims to join.
    expect(start.x).toBeGreaterThanOrEqual(sw.bounds.x);
    expect(start.x).toBeLessThanOrEqual(sw.bounds.x + sw.bounds.width + 1);
    expect(end.x).toBeGreaterThanOrEqual(rec.bounds.x - 1);
    expect(end.x).toBeLessThanOrEqual(rec.bounds.x + rec.bounds.width);
  });

  it('leaves room between layers for a cable label', async () => {
    const { layout } = await layoutOf(STUDIO);
    const sw = layout.devices.find((d) => d.id === 'sw')!;
    const rec = layout.devices.find((d) => d.id === 'rec')!;
    expect(rec.bounds.x - (sw.bounds.x + sw.bounds.width)).toBeGreaterThan(40);
  });

  it('lays out top to bottom when asked', async () => {
    const { layout } = await layoutOf(
      'diagram { direction: TB }\ndevice d { in A : sdi out B : sdi }',
    );
    const ports = layout.devices[0]!.ports;
    expect(ports.find((p) => p.name === 'A')?.side).toBe('NORTH');
    expect(ports.find((p) => p.name === 'B')?.side).toBe('SOUTH');
  });
});

// Legend keys are the only 22px-wide swatch strokes in the document; port names such
// as `SDI` appear as ordinary labels too, so matching on the text alone proves nothing.
function legendKeys(svg: string): number {
  return svg.match(/h 22"/g)?.length ?? 0;
}

describe('svg output', () => {
  it('produces a self-contained document with no external references', async () => {
    const { svg } = await compile(STUDIO);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<image');
  });

  it('draws the title, device labels and port names', async () => {
    const { svg } = await compile(STUDIO);
    expect(svg).toContain('テスト系統図');
    expect(svg).toContain('スイッチャー');
    expect(svg).toContain('PGM');
  });

  it('draws cable labels with their lengths', async () => {
    const { svg } = await compile(STUDIO);
    expect(svg).toContain('V-01  30m');
  });

  it('colours each link by its signal type', async () => {
    const { svg, diagram } = await compile(STUDIO);
    const sdi = diagram.signals['sdi']!;
    const xlr = diagram.signals['xlr']!;
    expect(svg).toContain(`stroke="${sdi.color}"`);
    expect(svg).toContain(`stroke="${xlr.color}"`);
  });

  it('draws one legend key per signal type in use', async () => {
    const { svg } = await compile(STUDIO);
    expect(legendKeys(svg)).toBe(2); // sdi and xlr
  });

  it('omits the legend when asked', async () => {
    const { svg } = await compile(STUDIO, { legend: false });
    expect(legendKeys(svg)).toBe(0);
  });

  it('halos a link that failed its compatibility check', async () => {
    const { svg, diagnostics } = await compile(`
      device a as generic { out CAT : hdbaset }
      device b as router  { io  1..4 : lan }
      a.CAT -> b.1
    `);
    expect(diagnostics.some((d) => d.code === 'signal-mismatch')).toBe(true);
    expect(svg).toContain('stroke="#dc2626"');
  });

  it('leaves a clean diagram unhaloed', async () => {
    const { svg } = await compile(STUDIO);
    expect(svg).not.toContain('stroke="#dc2626"');
  });

  it('escapes markup in labels rather than emitting it', async () => {
    const { svg } = await compile('device d "<script>alert(1)</script>" as generic');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders a bidirectional link with arrowheads at both ends', async () => {
    const { svg } = await compile(`
      device a as mixer  { io DANTE : dante }
      device b as router { io 1..4  : dante }
      a.DANTE <-> b.1
    `);
    expect(svg).toContain('marker-start=');
    expect(svg).toContain('marker-end=');
  });

  it('gives an undirected link no arrowheads', async () => {
    const { svg } = await compile(`
      device p as generic { out AC : ac }
      device r as generic { in  AC : ac }
      p.AC -- r.AC : ac
    `);
    expect(svg).not.toContain('marker-end=');
  });

  it('still draws a diagram whose wiring is wrong', async () => {
    const { svg, diagnostics } = await compile('a.X -> b.Y\nthis is broken');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(svg).toContain('<svg');
  });

  it('draws an empty document without crashing', async () => {
    const { svg } = await compile('');
    expect(svg).toContain('<svg');
  });

  it('draws a cable in the jacket colour written on it', async () => {
    const { svg, diagram } = await compile(`
      device a { out X : sdi }
      device b { in  Y : sdi }
      a.X -> b.Y : sdi [color=青]
    `);
    // The jacket colour wins over the signal-type convention. Check the cable itself,
    // not the whole document — the legend key keeps SDI's colour on purpose.
    expect(diagram.links[0]?.color).toBe('#2563eb');
    const cable = svg.match(/<polyline[^>]*\/>/)?.[0] ?? '';
    expect(cable).toContain('stroke="#2563eb"');
    expect(cable).not.toContain(diagram.signals['sdi']!.color);
  });

  it('accepts English names and hex as well', async () => {
    const en = await compile('a.X -> b.Y : sdi [color=green]');
    expect(en.diagram.links[0]?.color).toBe('#16a34a');
    const hex = await compile('a.X -> b.Y : sdi [color="#0af"]');
    expect(hex.diagram.links[0]?.color).toBe('#0af');
  });

  it('gives a coloured cable its own arrowhead', async () => {
    const { svg } = await compile('a.X -> b.Y : sdi [color=紫]');
    expect(svg).toContain('id="arrow-9333ea"');
    expect(svg).toContain('marker-end="url(#arrow-9333ea)"');
  });

  it('rejects a value that is not a colour instead of passing it through', async () => {
    const { svg, diagnostics } = await compile('a.X -> b.Y : sdi [color="url(#evil)"]');
    expect(diagnostics.some((d) => d.code === 'invalid-value')).toBe(true);
    expect(svg).not.toContain('url(#evil)');
  });

  it('keeps the legend keyed by signal type, not by cable colour', async () => {
    const { svg, diagram } = await compile(`
      device a { out X : sdi }
      device b { in  Y : sdi }
      a.X -> b.Y : sdi [color=黄]
    `);
    // The key still shows what SDI looks like; the individual cable is a separate fact.
    expect(svg).toContain(`stroke="${diagram.signals['sdi']!.color}" stroke-width="2"`);
  });

  it('marks a link that carries a conversion adapter', async () => {
    const { svg } = await compile(`
      device a as computer { out HDMI : hdmi }
      device b as display  { in  DVI  : dvi }
      a.HDMI -> b.DVI via "HDMI-DVI 変換ケーブル"
    `);
    expect(svg).toContain('⇄');
  });
});

describe('themes', () => {
  it('defaults to a light background', async () => {
    const { svg } = await compile(STUDIO);
    expect(svg).toContain('fill="#ffffff"');
  });

  it('applies a theme passed by the caller', async () => {
    const { svg } = await compile(STUDIO, { theme: 'dark' });
    expect(svg).toContain(`fill="${THEMES['dark']!.background}"`);
  });

  it('lets the source pin its own theme over the caller default', async () => {
    // The drawing knows how it is meant to look; the caller only knows a default.
    const { svg } = await compile(`diagram { theme: blueprint }\n${STUDIO}`, { theme: 'dark' });
    expect(svg).toContain(`fill="${THEMES['blueprint']!.background}"`);
    expect(svg).not.toContain(`fill="${THEMES['dark']!.background}"`);
  });

  it('falls back to the default when a theme name is unknown', async () => {
    const { svg } = await compile(STUDIO, { theme: 'nosuchtheme' });
    expect(svg).toContain('fill="#ffffff"');
  });

  it('discards signal colours under the monochrome theme', async () => {
    const { svg, diagram } = await compile(STUDIO, { theme: 'mono' });
    expect(svg).not.toContain(diagram.signals['sdi']!.color);
    expect(svg).not.toContain(diagram.signals['xlr']!.color);
  });

  it('distinguishes signals by line style when colour is gone', async () => {
    // Video stays solid and audio becomes dashed, so a photocopy is still readable.
    const { svg } = await compile(STUDIO, { theme: 'mono' });
    expect(svg).toMatch(/stroke-dasharray/);
  });

  it('ignores a cable jacket colour on a monochrome print', async () => {
    const { svg } = await compile('a.X -> b.Y : sdi [color=青]', { theme: 'mono' });
    expect(svg).not.toContain('#2563eb');
  });

  it('still honours a jacket colour on a colour theme', async () => {
    const { svg } = await compile('a.X -> b.Y : sdi [color=青]', { theme: 'dark' });
    expect(svg).toContain('#2563eb');
  });

  it('keeps every theme self-consistent', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      expect(theme.name).toBe(name);
      // Text on the box must not be the box itself.
      expect(theme.text).not.toBe(theme.boxFill);
      expect(theme.boxStroke).not.toBe(theme.boxFill);
    }
  });
});

describe('adapter marks', () => {
  it('marks a link that carries a conversion adapter', async () => {
    const { svg } = await compile(`
      device a as computer { out HDMI : hdmi }
      device b as display  { in  DVI  : dvi }
      a.HDMI -> b.DVI via "HDMI-DVI 変換ケーブル"
    `);
    expect(svg).toContain('⇄');
  });
});

describe('the key below the drawing', () => {
  /** Every signal type used, on a layout narrow enough that the key is the wider thing. */
  const MANY = (() => {
    const signals = ['sdi', 'xlr', 'trs', 'hdmi', 'dvi', 'lan', 'usb', 'madi'];
    const lines = ['device a as generic {'];
    signals.forEach((s, i) => lines.push(`  out P${i} : ${s}`));
    lines.push('}', 'device b as generic {');
    signals.forEach((s, i) => lines.push(`  in Q${i} : ${s}`));
    lines.push('}');
    signals.forEach((s, i) => lines.push(`a.P${i} -> b.Q${i} : ${s}`));
    return lines.join('\n');
  })();

  it('says what it is', async () => {
    // Without a caption a reader counts the entries and takes them for the cables. Five
    // types under seven drawn runs is a wrong number sitting beneath a drawing someone
    // plans a job from.
    const { diagram } = buildModel(
      parse(
        [
          'device a as generic { out X : sdi }',
          'device b as generic { in Y : sdi }',
          'a.X -> b.Y : sdi',
        ].join('\n'),
      ).document,
    );
    expect(await renderDiagram(diagram, { locale: 'en' })).toContain('>Signals<');
    expect(await renderDiagram(diagram, { locale: 'ja' })).toContain('>信号種別<');
  });

  it('fits inside the canvas', async () => {
    // The width came from the layout alone, so a narrow drawing with several signal types
    // ran its key off the right-hand edge — where it is not merely ugly but cropped.
    const { diagram } = buildModel(parse(MANY).document);
    const svg = await renderDiagram(diagram);

    const width = Number(/width="([0-9.]+)"/.exec(svg)?.[1]);
    const rightmost = Math.max(
      ...[...svg.matchAll(/<text x="([0-9.]+)"[^>]*font-size="11"/g)].map((m) => Number(m[1])),
    );
    expect(rightmost).toBeLessThan(width);
  });

  it('is left out when there is nothing to key', async () => {
    const { diagram } = buildModel(
      parse(
        [
          'device a as generic { out X : sdi }',
          'device b as generic { in Y : sdi }',
          'a.X -> b.Y : sdi',
        ].join('\n'),
      ).document,
    );
    expect(await renderDiagram(diagram, { legend: false })).not.toContain('>Signals<');
  });
});

describe('groups inside groups', () => {
  const VENUE = [
    'diagram "会場" { direction: LR }',
    'group venue "幕張メッセ" {',
    '  group stage "ステージ" { device cam "FX3" as camera { out SDI : sdi } }',
    '  group rack  "ラック"   { device sw "ATEM" as switcher { in 1 : sdi  out PGM : sdi } }',
    '}',
    'group booth "中継車" { device rec "HyperDeck" as recorder { in SDI : sdi } }',
    'cam.SDI -> sw.1    : sdi 30m "V-01"',
    'sw.PGM  -> rec.SDI : sdi 50m "V-10"',
  ].join('\n');

  it('remembers which group each one sits in', async () => {
    const { diagram } = await layoutOf(VENUE);
    const by = Object.fromEntries(diagram.groups.map((g) => [g.id, g]));
    expect(by['venue']?.parent).toBeUndefined();
    expect(by['stage']?.parent).toBe('venue');
    expect(by['rack']?.parent).toBe('venue');
    expect(by['booth']?.parent).toBeUndefined();
  });

  it('draws the outer one around the inner ones', async () => {
    // Built flat, an outer group had no children of its own and nothing to size itself
    // from — so it came out with no width at all rather than around anything.
    const { layout } = await layoutOf(VENUE);
    const by = Object.fromEntries(layout.groups.map((g) => [g.id, g.bounds]));

    const venue = by['venue']!;
    expect(venue.width).toBeGreaterThan(0);
    expect(venue.height).toBeGreaterThan(0);

    for (const inner of ['stage', 'rack'] as const) {
      const box = by[inner]!;
      expect(box.x, `${inner}.x`).toBeGreaterThanOrEqual(venue.x);
      expect(box.y, `${inner}.y`).toBeGreaterThanOrEqual(venue.y);
      expect(box.x + box.width, `${inner} right`).toBeLessThanOrEqual(venue.x + venue.width);
      expect(box.y + box.height, `${inner} bottom`).toBeLessThanOrEqual(venue.y + venue.height);
    }
  });

  it('leaves a group that is nobody else’s child where it is', async () => {
    const { layout } = await layoutOf(VENUE);
    const by = Object.fromEntries(layout.groups.map((g) => [g.id, g.bounds]));
    const venue = by['venue']!;
    const booth = by['booth']!;
    // Side by side, not one inside the other.
    expect(booth.x >= venue.x + venue.width || venue.x >= booth.x + booth.width).toBe(true);
  });

  it('draws every name, however deep', async () => {
    const { svg } = await compile(VENUE, { locale: 'ja' });
    for (const name of ['幕張メッセ', 'ステージ', 'ラック', '中継車']) {
      expect(svg, name).toContain(name);
    }
  });
});

describe('a drawing that runs top to bottom', () => {
  const SHOW = [
    'diagram { direction: TB }',
    'device cam "カメラ" as camera   { out SDI : sdi }',
    'device sw  "卓"     as switcher { in 1 : sdi  out PGM : sdi }',
    'device rec "収録"   as recorder { in SDI : sdi }',
    'cam.SDI -> sw.1    : sdi 10m "V-01"',
    'sw.PGM  -> rec.SDI : sdi 5m  "V-02"',
  ].join('\n');

  /** Every `<text>` in the drawing, stripped to what it says. */
  const words = (svg: string): string[] =>
    [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/gs)].map((m) => m[1]!.replace(/<[^>]*>/g, ''));

  it('names its ports, the same as one that runs left to right', async () => {
    // It did not. A vertical drawing got a dot for every port and no name beside any of
    // them, because the renderer only had a branch for the two horizontal faces. The box
    // knew which port was which and the drawing would not say.
    const { svg } = await compile(SHOW, { locale: 'ja' });
    for (const name of ['SDI', '1', 'PGM']) expect(words(svg), name).toContain(name);

    const across = await compile(SHOW.replace('direction: TB', 'direction: LR'), { locale: 'ja' });
    expect(words(svg).sort()).toEqual(words(across.svg).sort());
  });

  it('keeps a port name inside its own box, clear of the header', async () => {
    // Below the header band on the top edge, above the bottom edge on the other — a name
    // printed over the device's own title is not a name anybody can read.
    const { diagram } = buildModel(parse(SHOW).document);
    const layout = await layoutDiagram(diagram);
    const svg = await renderDiagram(diagram, { locale: 'ja' });

    const labels = [...svg.matchAll(/<text[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*font-size="10"/g)];
    const ports = layout.devices.flatMap((d) => d.ports);

    let inside = 0;
    for (const [, sx, sy] of labels) {
      const x = Number(sx);
      const y = Number(sy);
      const box = layout.devices.find(
        (d) =>
          x >= d.bounds.x &&
          x <= d.bounds.x + d.bounds.width &&
          y >= d.bounds.y &&
          y <= d.bounds.y + d.bounds.height,
      )?.bounds;
      // Cable numbers sit between boxes and belong to none; a port name belongs to one.
      if (box === undefined) continue;
      inside += 1;
      expect(y, `${x},${y} が見出しに重なる`).toBeGreaterThan(box.y + 28);
      expect(y, `${x},${y} が箱からはみ出す`).toBeLessThan(box.y + box.height);
    }
    // Every port, not "at least one" — what went wrong was that all of them were missing.
    expect(inside).toBe(ports.length);
  });

  it('widens a column to fit the name written under it', async () => {
    // Sixteen inputs across the top edge, each with a name beneath the dot. Measured off
    // the dots rather than the text, so the claim is about spacing and not about a font.
    const { diagram } = buildModel(
      parse('diagram { direction: TB }\ndevice dk "卓" as mixer { in CH[1..16] : xlr }').document,
    );
    const layout = await layoutDiagram(diagram);
    const xs = layout.devices[0]!.ports.map((p) => p.center.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(Math.min(...gaps)).toBeGreaterThan(24);
  });

  it('does not widen every input column to fit an output name', async () => {
    // `MAIN_L` and `MAIN_R` are wide and there are two of them. Sixteen inputs do not each
    // need room for a name none of them carries.
    const wide = 'device dk "卓" as mixer { in CH[1..16] : xlr  out MAIN_L, MAIN_R : xlr }';
    const plain = 'device dk "卓" as mixer { in CH[1..16] : xlr  out L, R : xlr }';
    const widthOf = async (ports: string) => {
      const { diagram } = buildModel(parse(`diagram { direction: TB }\n${ports}`).document);
      return (await layoutDiagram(diagram)).devices[0]!.bounds.width;
    };
    expect(await widthOf(wide)).toBe(await widthOf(plain));
  });
});

describe('how small a drawing may be made', () => {
  it('stops where the smallest label stops being readable', () => {
    // A page fits a wide drawing to its column by scaling, and scaling has no floor of its
    // own: a 924px diagram in a 560px note came out at 61%, taking the port names from 10px
    // to 6px. The smallest thing drawn is three under the base size, so 8px lands at 0.8.
    expect(legibleScale()).toBeCloseTo(0.8, 5);
    expect(924 * legibleScale()).toBeCloseTo(739.2, 1);
  });

  it('never asks for more than the drawing already is', () => {
    // Small type is already legible at full size; the answer is "do not grow it", not a
    // scale above one that would blow a small diagram up to fill the column.
    expect(legibleScale({ fontSize: 11 })).toBe(1);
    expect(legibleScale({ fontSize: 9 })).toBe(1);
  });

  it('follows the type size it was rendered at', () => {
    // Bigger type survives more shrinking, and the floor has to know that or it is a
    // constant pretending to be a measurement.
    expect(legibleScale({ fontSize: 20 })).toBeLessThan(legibleScale({ fontSize: 14 }));
  });
});

describe('a link that crosses a group boundary', () => {
  // A camera two groups deep, running to a switcher one group deep. They share `devices`,
  // and ELK lays the edge out in that group's coordinates whatever it is told — so an edge
  // parked on the root came back offset by the group's origin and was drawn a long way from
  // both boxes. On the page that reads as a line that was simply never drawn.
  const NESTED = [
    'device far "Far" as recorder { in SDI : sdi }',
    'group outer "Outer" {',
    '  device sw "SW" as switcher { in 1 : sdi  out PGM : sdi }',
    '  group inner "Inner" {',
    '    device cam "Cam" as camera { out SDI : sdi }',
    '  }',
    '}',
    'cam.SDI -> sw.1    : sdi 5m "V-01"',
    'sw.PGM  -> far.SDI : sdi 5m "V-02"',
  ].join('\n');

  it('joins the boxes it says it joins', async () => {
    const { layout } = await layoutOf(NESTED);
    const portAt = (device: string, name: string) => {
      const box = layout.devices.find((d) => d.id === device)!;
      return box.ports.find((p) => p.name === name)!.center;
    };

    for (const [id, from, to] of [
      ['cam.SDI->sw.1', portAt('cam', 'SDI'), portAt('sw', '1')],
      ['sw.PGM->far.SDI', portAt('sw', 'PGM'), portAt('far', 'SDI')],
    ] as const) {
      const edge = layout.edges.find((e) => e.id.startsWith(id));
      expect(edge, id).toBeDefined();
      const start = edge!.points[0]!;
      const end = edge!.points.at(-1)!;
      // Within a few pixels of the dot: the route may leave at a slight angle, but it has
      // to leave from the port rather than from wherever the group happens to sit.
      expect(Math.hypot(start.x - from.x, start.y - from.y), `${id} の始点`).toBeLessThan(8);
      expect(Math.hypot(end.x - to.x, end.y - to.y), `${id} の終点`).toBeLessThan(8);
    }
  });

  it('puts the edge on the group that holds both ends', async () => {
    // Not "the same immediate group" — that sent every link between nesting levels to the
    // root, where its coordinates meant something else.
    const { layout } = await layoutOf(NESTED);
    const inner = layout.groups.find((g) => g.id === 'inner')!;
    const edge = layout.edges.find((e) => e.id.startsWith('cam.SDI->sw.1'))!;
    // If the container were wrong, the start would land near the inner group's origin
    // rather than on the camera's port.
    expect(
      Math.hypot(edge.points[0]!.x - inner.bounds.x, edge.points[0]!.y - inner.bounds.y),
    ).toBeGreaterThan(8);
  });
});

describe('the order devices are written in', () => {
  const SHOW = [
    'group rack "ラック" {',
    '  device a "A" as camera { out O : sdi }',
    '  device b "B" as camera { out O : sdi }',
    '  device c "C" as camera { out O : sdi }',
    '}',
    'device rec "R" as recorder { in 1..3 : sdi }',
    // Wired so that untangling wants a different order than the one written.
    'a.O -> rec.3 : sdi 2m',
    'b.O -> rec.1 : sdi 2m',
    'c.O -> rec.2 : sdi 2m',
  ].join('\n');

  /**
   * The devices in the order they are drawn across the layer.
   *
   * Across the flow, which is the axis a layer is stacked along: down the page for `LR`,
   * across it for `TB`. Reading `y` for both is how this shipped ordering nothing at all in
   * a top-to-bottom drawing.
   */
  const acrossLayer = async (source: string, direction: 'LR' | 'TB') => {
    const { layout } = await layoutOf(`diagram { direction: ${direction} }\n${source}`);
    return layout.devices
      .filter((d) => ['a', 'b', 'c'].includes(d.id))
      .sort((p, q) => (direction === 'LR' ? p.bounds.y - q.bounds.y : p.bounds.x - q.bounds.x))
      .map((d) => d.id)
      .join(',');
  };

  for (const direction of ['LR', 'TB'] as const) {
    it(`is rearranged by default, to untangle the cables (${direction})`, async () => {
      // Which is right when the order is incidental — and it usually is.
      expect(await acrossLayer(SHOW, direction)).toBe('b,c,a');
    });

    it(`is kept when the diagram asks for it (${direction})`, async () => {
      // A rack list is read top to bottom, and a drawing that reshuffles it to save two
      // crossings is describing a different rack.
      expect(await acrossLayer(`diagram { order: fixed }\n${SHOW}`, direction)).toBe('a,b,c');
    });
  }

  it('orders the groups inside a group too, not only the devices', async () => {
    // The report this came from nests two levels; the outer group's children are groups.
    const { layout } = await layoutOf(
      [
        'diagram { direction: TB; order: fixed }',
        'group outer "Outer" {',
        '  group first "First"  { device a "A" as camera { out O : sdi } }',
        '  group second "Second" { device b "B" as camera { out O : sdi } }',
        '  group third "Third"  { device c "C" as camera { out O : sdi } }',
        '}',
        'device r "R" as recorder { in 1..3 : sdi }',
        'a.O -> r.3 : sdi 2m',
        'b.O -> r.1 : sdi 2m',
        'c.O -> r.2 : sdi 2m',
      ].join('\n'),
    );
    const order = layout.groups
      .filter((g) => ['first', 'second', 'third'].includes(g.id))
      .sort((p, q) => p.bounds.x - q.bounds.x)
      .map((g) => g.id)
      .join(',');
    expect(order).toBe('first,second,third');
  });

  it('reports an order it cannot follow rather than ignoring it', async () => {
    const { diagram, diagnostics } = buildModel(parse('diagram { order: loose }').document);
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
    expect(diagnostics[0]?.message).toContain('loose');
    expect(diagram.ordered).toBeUndefined();
  });

  it('keeps `order` off the loose options bag once it is understood', async () => {
    // One answer rather than two, the same as `direction`.
    const { diagram } = buildModel(parse('diagram { order: fixed }').document);
    expect(diagram.ordered).toBe(true);
    expect(diagram.options['order']).toBeUndefined();
  });
});

describe('a whole show, ordered', () => {
  // The diagram this came from. Nothing smaller reproduced it: two nesting levels, five
  // sibling groups and twenty-one links are what it takes for the layout to want a
  // different order than the one written, and `order: fixed` shipped doing nothing about
  // it in a top-to-bottom drawing. Long, and the only thing that catches it.
  const SHOW = [
    'diagram "ミノ駆動さんイベント" {',
    '    order: fixed',
    '    direction: TB',
    '}',
    '',
    'model obsbott2 "OBSBOT Tail 2" as camera {',
    '    out USB1 : usb',
    '    in  USB2 : usbpd',
    '    io  WiFi : wifi | ndi',
    '    io  LAN  : lan | ndi',
    '    out HDMI : hdmi',
    '    out SDI  : sdi',
    '}',
    '',
    'model nw_switcher "Network Switcher" as switcher {',
    '    io LAN [1..10] : lan',
    '}',
    '',
    'model rwptx "RØDE Wireless Pro Transmitter" as microphone {',
    '    out Wireless : bluetooth',
    '}',
    '',
    'model dm2tx "DJI Mic 2 Transmitter" as microphone {',
    '    out Wireless : bluetooth',
    '}',
    '',
    'model dm2rx "DJI Mic 2 Reciever" as interface {',
    '    in  Wireless1 : bluetooth',
    '    in  Wireless2 : bluetooth',
    '    out USB       : usb',
    '    out Pin       : trrs35',
    '}',
    '',
    'model sonya73 "Sony α7 III" as camera {',
    '    out HDMI : hdmi',
    '    io  USB  : usb | usbpd',
    '}',
    '',
    'group actors "演者" {',
    '    group mino "ミノ駆動" {',
    '        device pro1 from rwptx "RØDE Wireless Pro 1"',
    '        device pc1 "ミノ駆動 PC" { out WiFi : ndi }',
    '    }',
    '    group rocky "rocky" {',
    '        device pro2 from rwptx "RØDE Wireless Pro 2"',
    '        device pc2 "rocky PC" { in WiFi : ndi }',
    '    }',
    '    group kotone "ことね" {',
    '        device dm21 from dm2tx "DJI Mic 2 1"',
    '        device pc4 "ことね PC" { in WiFi : ndi }',
    '    }',
    '    group kumamoto "くまもと" {',
    '        device dm22 from dm2tx "DJI Mic 2 2"',
    '        device pc3 "くまもと PC" { in WiFi : ndi }',
    '    }',
    '    group sasapiyo "ささぴよ" {',
    '        device dm23 from dm2tx "DJI Mic 2 3"',
    '        device pc5 "ささぴよ PC" { in WiFi : ndi }',
    '    }',
    '}',
    '',
    'group network "ネットワーク" {',
    '    device ethernet_switch from nw_switcher "ネットワークスイッチ"',
    '    device ux "UniFi Express" as switcher {',
    '        io WiFi : wifi',
    '        io LAN  : lan',
    '        io WAN  : lan',
    '    }',
    '}',
    '',
    'group monitors "モニター" {',
    '    device monitor1 "ミニモニター" { in HDMI : hdmi }',
    '    device monitor2 "返しモニター" { in HDMI : hdmi }',
    '}',
    '',
    'group devices "収録機材類" {',
    ' device rcv "RØDECaster Video" as switcher {',
    '     in HDMI [1..4] : hdmi',
    '     gap',
    '     io USB [1..2] : usb',
    '     in USB [4..5] : usb',
    '     gap',
    '     in COMBO [1..2] : trs | xlr',
    '     gap',
    '     in Wireless [1..2] : bluetooth',
    '     gap',
    '     in USB-PD : usb',
    '',
    '     out HDMIOUT [1..2] : hdmi',
    '     gap',
    '     out Master_L, Master_R : trs',
    '     gap',
    '     out Headphones [1..2] : trrs',
    '',
    '     gap',
    '     io WiFi : wifi',
    '     io LAN  : lan',
    ' }',
    ' device dm2r from dm2rx "DJI Mic 2 Receiver"',
    ' group cameras "カメラ" {',
    '     device obsbott2 from obsbott2 "OBSBOT Tail 2"',
    '     device a73 from sonya73 "Sony α7 III"',
    '     device dop3 "DJI OSMO Pocket 3" as camera {',
    '         in  Wireless : bluetooth',
    '         out USB      : usb',
    '     }',
    ' }',
    '}',
    '',
    'adapter trrs_split "TRRS 分岐ケーブル" as cable ?m {',
    '    in  TRRS_35      : trrs35',
    '    out TRS_L, TRS_R : trs',
    '}',
    '',
    'adapter usb_hdmi "USB-HDMI 変換アダプタ" as cable ?m {',
    '    in  USB  : usb',
    '    out HDMI : hdmi',
    '}',
    '',
    'pro1.Wireless -> rcv.Wireless1',
    'pro2.Wireless -> rcv.Wireless2',
    'dm21.Wireless -> dm2r.Wireless1',
    'dm22.Wireless -> dm2r.Wireless2',
    'dm23.Wireless -> dop3.Wireless',
    'dm2r.Pin         -> trrs_split.TRRS_35',
    'trrs_split.TRS_L -> rcv.COMBO1         : trs',
    'trrs_split.TRS_R -> rcv.COMBO2         : trs',
    'dop3.USB      -> usb_hdmi.USB',
    'usb_hdmi.HDMI -> rcv.HDMI1    : hdmi',
    'rcv.LAN <-> ethernet_switch.LAN1 : lan',
    'ethernet_switch.LAN2 <-> ux.LAN : ndi over lan',
    'pc1.WiFi <-> ux.WiFi  : ndi over wifi',
    'ux.WiFi  <-> pc2.WiFi : ndi over wifi',
    'ux.WiFi  <-> pc3.WiFi : ndi over wifi',
    'ux.WiFi  <-> pc4.WiFi : ndi over wifi',
    'ux.WiFi  <-> pc5.WiFi : ndi over wifi',
    'obsbott2.WiFi <-> ux.WiFi   : ndi over wifi',
    'a73.HDMI  ->  rcv.HDMI2 : hdmi',
    'rcv.HDMIOUT1 -> monitor1.HDMI : hdmi',
    'rcv.HDMIOUT2 -> monitor2.HDMI : hdmi',
  ].join('\n');

  it('keeps the cameras in the order they were written', async () => {
    const { diagram } = buildModel(parse(SHOW).document);
    const layout = await layoutDiagram(diagram);
    const cameras = diagram.groups.find((g) => g.id === 'cameras')!.deviceIds;
    const drawn = layout.devices
      .filter((d) => cameras.includes(d.id))
      .sort((p, q) => p.bounds.x - q.bounds.x)
      .map((d) => d.id);
    expect(drawn).toEqual(cameras);
  });

  it('keeps the groups inside a group in the order they were written', async () => {
    const { diagram } = buildModel(parse(SHOW).document);
    const layout = await layoutDiagram(diagram);
    const inside = diagram.groups.filter((g) => g.parent === 'actors').map((g) => g.id);
    const drawn = layout.groups
      .filter((g) => inside.includes(g.id))
      .sort((p, q) => p.bounds.x - q.bounds.x)
      .map((g) => g.id);
    expect(drawn).toEqual(inside);
  });
});
