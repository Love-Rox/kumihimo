import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { toDrawio } from '../src/export/drawio.js';
import { parse } from '../src/parser.js';

const SOURCE = `
diagram "テスト" { direction: LR }

group rack "ラック" {
  device sw "スイッチャー" as switcher { in 1..4 : sdi  out PGM : sdi }
  device mx "ミキサー"     as mixer    { in CH[1..16] : xlr }
}
device cam "カメラ" as camera { out SDI : sdi }

cam.SDI -> sw.1 : sdi 30m "V-01" [color=青]
sw.PGM  -> mx.CH1 : xlr 2m "A-01"
`;

async function drawio(source = SOURCE): Promise<string> {
  return toDrawio(buildModel(parse(source).document).diagram);
}

/** Pull `<mxCell …>` fragments whose id starts with a prefix. */
function cells(xml: string, prefix: string): string[] {
  return [...xml.matchAll(/<mxCell id="([^"]+)"[\s\S]*?(?:\/>|<\/mxCell>)/g)]
    .filter((match) => match[1]!.startsWith(prefix))
    .map((match) => match[0]);
}

describe('draw.io export', () => {
  it('produces a well-formed mxfile', async () => {
    const xml = await drawio();
    expect(xml.startsWith('<mxfile')).toBe(true);
    expect(xml.endsWith('</mxfile>')).toBe(true);
    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('<mxCell id="0" />');
    expect(xml).toContain('<mxCell id="1" parent="0" />');
  });

  it('emits a cell per group, device and port', async () => {
    const xml = await drawio();
    expect(cells(xml, 'grp-')).toHaveLength(1);
    expect(cells(xml, 'dev-')).toHaveLength(3);
    // 4 + 1 on the switcher, 16 on the mixer, 1 on the camera.
    expect(cells(xml, 'port-')).toHaveLength(22);
  });

  it('parents ports to their device, so moving a box moves its connectors', async () => {
    const xml = await drawio();
    for (const cell of cells(xml, 'port-sw')) {
      expect(cell).toContain('parent="dev-sw"');
      expect(cell).toContain('relative="1"');
    }
  });

  it('parents grouped devices to their group, so a rack moves as one', async () => {
    const xml = await drawio();
    expect(cells(xml, 'dev-sw')[0]).toContain('parent="grp-rack"');
    // An ungrouped device stays on the root layer.
    expect(cells(xml, 'dev-cam')[0]).toContain('parent="1"');
  });

  it('attaches edges to ports rather than to boxes', async () => {
    // This is the whole point of the export: flattening ports would look identical and
    // fall apart the moment anyone edited the result.
    const edges = cells(await drawio(), 'edge-');
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge).toMatch(/source="port-/);
      expect(edge).toMatch(/target="port-/);
    }
  });

  it('gives every port on a device a distinct position', async () => {
    // Port geometry is a fraction of the box, so rounding it to pixel precision would
    // collapse a sixteen-channel mixer into pairs sitting on top of each other.
    const xml = await drawio();
    const positions = cells(xml, 'port-mx').map((cell) => {
      const geometry = /<mxGeometry x="([^"]+)" y="([^"]+)"/.exec(cell);
      return `${geometry?.[1]},${geometry?.[2]}`;
    });
    expect(positions).toHaveLength(16);
    expect(new Set(positions).size).toBe(16);
  });

  it('carries the signal colour and the cable jacket colour', async () => {
    const xml = await drawio();
    // The SDI run was given a blue jacket, which wins over the signal convention.
    expect(xml).toContain('strokeColor=#2563eb');
  });

  it('labels edges with their cable number and length', async () => {
    expect(await drawio()).toContain('value="V-01  30m"');
  });

  it('dashes a wireless link and shows its frequency', async () => {
    const xml = await drawio(`
      device mic as microphone { out RF : uhf }
      device rx  as interface  { in  RF : uhf }
      mic.RF -> rx.RF : uhf [ch=38]
    `);
    expect(xml).toMatch(/dashed=1/);
    expect(xml).toContain('ch 38');
  });

  it('escapes markup in labels rather than emitting it', async () => {
    const xml = await drawio('device d "<script>alert(1)</script>" as generic');
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
  });

  it('escapes an apostrophe, which draw.io style strings quote with', async () => {
    const xml = await drawio(`device d "it's here" as generic`);
    expect(xml).toContain('&apos;');
  });

  it('sanitises ids that draw.io would not accept verbatim', async () => {
    const xml = await drawio('device 配信PC as computer { in LAN : lan }');
    const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]!);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('applies a theme', async () => {
    const xml = await drawio('diagram { theme: dark }\ndevice d as generic');
    expect(xml).toContain('background="#0f172a"');
  });

  it('exports an empty diagram without crashing', async () => {
    const xml = await drawio('');
    expect(xml).toContain('<mxfile');
  });
});
