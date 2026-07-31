import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { compile } from '../src/compile.js';
import { layoutDiagram } from '../src/layout.js';
import { parse } from '../src/parser.js';
import { renderDiagram } from '../src/render.js';
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
