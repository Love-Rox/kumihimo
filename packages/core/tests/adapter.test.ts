/**
 * `adapter` — a passive part with named ends.
 *
 * The distinction being tested is not cosmetic. A converter is a powered box, so it needs
 * racking *and* a cable on each side. A conversion lead is the cable, and needs only
 * itself. Declaring both as devices put a headset splitter on the equipment list and
 * invented three cable runs for a thing that is one line item — which is a packing list
 * that sends someone to site with the wrong bag.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { renderDiagram } from '../src/render.js';
import { adapterSchedule, cableSchedule, equipmentSchedule } from '../src/schedule.js';

const SPLITTER = [
  'device phone "スマホ" as computer { io HS : trrs35 }',
  'adapter split "TRRS 分岐ケーブル" {',
  '  io  HS  : trrs35',
  '  out HP  : trs35',
  '  in  MIC : trs35',
  '}',
  'device hp  "ヘッドホン" as speaker { in IN : trs35 }',
  'device mic "マイク" as microphone  { out OUT : trs35 }',
];

function build(lines: readonly string[]) {
  const { document, diagnostics: parsed } = parse(lines.join('\n'));
  const { diagram, diagnostics: built } = buildModel(document);
  return { diagram, diagnostics: [...parsed, ...built] };
}

describe('declaring one', () => {
  it('parses, and reaches the model as a passive part', () => {
    const { diagram, diagnostics } = build([...SPLITTER, 'phone.HS -> split.HS : trrs35']);
    expect(diagnostics).toEqual([]);

    const split = diagram.devices.find((d) => d.id === 'split');
    expect(split?.passive).toBe(true);
    expect(split?.label).toBe('TRRS 分岐ケーブル');
    expect(split?.ports.map((p) => p.name)).toEqual(['HS', 'HP', 'MIC']);
  });

  it('leaves a device passive-free, so the flag means something', () => {
    const { diagram } = build(['device a as mixer { in X : xlr }']);
    expect(diagram.devices[0]?.passive).toBe(false);
  });

  it('needs no kind, and is not one', () => {
    // `device x as adapter` should stay meaningless: an adapter is drawn as what it is.
    const { diagnostics } = build(['device x as adapter { in A : xlr }']);
    expect(diagnostics.map((d) => d.code)).toContain('unknown-device-kind');
  });
});

describe('the schedules', () => {
  const wired = [
    ...SPLITTER,
    'phone.HS -> split.HS  : trrs35',
    'split.HP -> hp.IN     : trs35',
    'mic.OUT  -> split.MIC : trs35',
  ];

  it('keeps the part off the equipment list', () => {
    // Nobody racks a headset splitter.
    const { diagram } = build(wired);
    expect(equipmentSchedule(diagram).map((r) => r.id)).toEqual(['phone', 'hp', 'mic']);
  });

  it('puts it on the parts list once, however many runs touch it', () => {
    const { diagram } = build(wired);
    const rows = adapterSchedule(diagram);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adapter).toBe('TRRS 分岐ケーブル');
    expect(rows[0]?.count).toBe(1);
  });

  it('invents no cable runs for what are really plugs', () => {
    // This is the defect. Three links touch the splitter, and all three are somebody
    // pushing a plug into a socket. None of them is a cable to bring.
    const { diagram } = build(wired);
    expect(cableSchedule(diagram)).toEqual([]);
  });

  it('does list a run that was given a length', () => {
    const { diagram } = build([
      ...SPLITTER,
      'phone.HS -> split.HS : trrs35',
      'split.HP -> hp.IN    : trs35 5m',
    ]);
    const rows = cableSchedule(diagram);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.length).toBe('5m');
  });

  it('does list a run that was given a number but no length', () => {
    // A length is often unknown when the drawing is made; a number is often assigned
    // before anyone measures. Either is the author saying "this one is a cable".
    const { diagram } = build([
      ...SPLITTER,
      'phone.HS -> split.HS : trrs35',
      'split.HP -> hp.IN    : trs35 "A-02"',
    ]);
    const rows = cableSchedule(diagram);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('A-02');
    expect(rows[0]?.length).toBeUndefined();
  });

  it('leaves a converter on both lists, which is the case it is contrasted with', () => {
    const { diagram } = build([
      'device cam as camera { out SDI : sdi }',
      'device conv "SDI-HDMI 変換器" as converter { in SDI : sdi  out HDMI : hdmi }',
      'device mon as display { in HDMI : hdmi }',
      'cam.SDI   -> conv.SDI : sdi 30m "V-01"',
      'conv.HDMI -> mon.HDMI : hdmi 2m "V-02"',
    ]);
    expect(equipmentSchedule(diagram).map((r) => r.id)).toContain('conv');
    expect(cableSchedule(diagram).map((r) => r.label)).toEqual(['V-01', 'V-02']);
  });
});

describe('drawing', () => {
  it('draws a part differently from a box', async () => {
    // A reader who cannot tell the splitter from the switcher will look for the splitter
    // in the rack. The header band is what makes the other boxes read as equipment.
    const { diagram } = build([...SPLITTER, 'phone.HS -> split.HS : trrs35']);
    const svg = await renderDiagram(diagram);

    expect(svg).toContain('TRRS 分岐ケーブル');
    // One header band per non-passive device, and none for the part.
    const devices = diagram.devices.filter((d) => !d.passive).length;
    expect(svg.split('rx="5"').length - 1).toBe(devices);
  });
});
