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

describe('the two things `via` was being asked to mean', () => {
  it('counts an adapter and its cable as two, because they are two', () => {
    // A 30 m SDI cable with a small adapter on the end. Two objects, two rows.
    const { diagram } = build([
      'device cam as camera  { out SDI : sdi }',
      'device mon as display { in SDI : sdi }',
      'cam.SDI -> mon.SDI : sdi 30m "V-01" via "BNC-RCA 変換"',
    ]);
    expect(cableSchedule(diagram).map((r) => r.label)).toEqual(['V-01']);
    expect(adapterSchedule(diagram).map((r) => r.adapter)).toEqual(['BNC-RCA 変換']);
  });

  it('counts a converting lead as one, because it is one', () => {
    // The lead *is* the run. Written with `via` it landed on both schedules, and someone
    // packing from both brings two cables for a job that needs one.
    const { diagram } = build([
      'device pc  as computer { out HDMI : hdmi }',
      'device mon as display  { in DVI : dvi }',
      'adapter hd "HDMI-DVI 変換ケーブル" {',
      '  in  IN  : hdmi',
      '  out OUT : dvi',
      '}',
      'pc.HDMI -> hd.IN   : hdmi',
      'hd.OUT  -> mon.DVI : dvi',
    ]);
    expect(cableSchedule(diagram)).toEqual([]);
    expect(adapterSchedule(diagram).map((r) => `${r.adapter} ×${r.count}`)).toEqual([
      'HDMI-DVI 変換ケーブル ×1',
    ]);
  });
});

describe('two ends is a cable, not a junction', () => {
  const LEAD = [
    'device pc  as computer { out HDMI : hdmi }',
    'device mon as display  { in DVI : dvi }',
  ];

  it('reports an adapter with two ends', () => {
    // A converting lead is one unbroken cable. Declaring it as a node puts a stop in the
    // middle of it that is not there, and draws one object as three.
    const { diagnostics } = build([
      ...LEAD,
      'adapter hd "HDMI-DVI 変換ケーブル" { in IN : hdmi  out OUT : dvi }',
      'pc.HDMI -> hd.IN   : hdmi',
      'hd.OUT  -> mon.DVI : dvi',
    ]);
    const hit = diagnostics.find((d) => d.code === 'invalid-value');
    expect(hit?.message).toContain('hd');
  });

  it('says nothing about a junction with three', () => {
    const { diagnostics } = build([...SPLITTER, 'phone.HS -> split.HS : trrs35']);
    expect(diagnostics).toEqual([]);
  });

  it('counts a converting lead once, on the cable schedule', () => {
    // The run *is* the lead. A row on the parts list as well would send someone to site
    // with two objects for a job that needs one.
    const { diagram } = build([
      ...LEAD,
      'pc.HDMI -> mon.DVI : hdmi 2m "V-02" via "HDMI-DVI cable"',
    ]);

    const cables = cableSchedule(diagram);
    expect(cables).toHaveLength(1);
    expect(cables[0]?.adapter).toBe('HDMI-DVI cable');
    expect(adapterSchedule(diagram)).toEqual([]);
  });

  it('counts a part beside a cable twice, because it is two things', () => {
    const { diagram } = build([
      'device cam as camera  { out SDI : sdi }',
      'device m   as display { in SDI : sdi }',
      'cam.SDI -> m.SDI : sdi 30m "V-01" via "BNC-RCA adapter"',
    ]);
    expect(cableSchedule(diagram)).toHaveLength(1);
    expect(adapterSchedule(diagram).map((r) => r.adapter)).toEqual(['BNC-RCA adapter']);
  });

  it('lists what a junction plugs into, not the runs it takes part in', () => {
    // Three runs for one part reads as three cables, which is what this schedule exists
    // to stop saying.
    const { diagram } = build([
      ...SPLITTER,
      'phone.HS -> split.HS  : trrs35',
      'split.HP -> hp.IN     : trs35',
      'mic.OUT  -> split.MIC : trs35',
    ]);
    expect(adapterSchedule(diagram)[0]?.links).toEqual(['スマホ', 'ヘッドホン', 'マイク']);
  });
});

describe('what makes an end a socket', () => {
  it('is not the number of ends', () => {
    // A USB-HDMI dongle has two and is a junction: the USB tail is moulded on, the HDMI
    // side is a socket, and the cable reaching it is one somebody has to bring.
    const { diagnostics, diagram } = build([
      'device pc  "ノートPC" as computer { out USB : usb }',
      'device mon "モニタ" as display    { in HDMI : hdmi }',
      'adapter dg "USB-HDMI 変換アダプタ" {',
      '  in  USB  : usb',
      '  out HDMI : hdmi',
      '}',
      'pc.USB  -> dg.USB   : usb',
      'dg.HDMI -> mon.HDMI : hdmi 2m "V-01"',
    ]);
    expect(diagnostics).toEqual([]);
    expect(cableSchedule(diagram).map((r) => r.label)).toEqual(['V-01']);
    expect(adapterSchedule(diagram).map((r) => r.adapter)).toEqual(['USB-HDMI 変換アダプタ']);
  });

  it('holds for a part with four ends too', () => {
    const moulded = [
      'device sw as mixer { out M : xlr }',
      'adapter fan "XLR 4分岐ケーブル" { in IN : xlr  out A : xlr  out B : xlr }',
      'device s1 as speaker { in IN : xlr }',
      'device s2 as speaker { in IN : xlr }',
      'sw.M   -> fan.IN : xlr',
      'fan.A  -> s1.IN  : xlr',
      'fan.B  -> s2.IN  : xlr',
    ];
    const panelled = [
      'device sw as mixer { out M : xlr }',
      'adapter br "分配パネル" { in IN : xlr  out A : xlr  out B : xlr }',
      'device s1 as speaker { in IN : xlr }',
      'device s2 as speaker { in IN : xlr }',
      'sw.M  -> br.IN : xlr',
      'br.A  -> s1.IN : xlr 10m "A-01"',
      'br.B  -> s2.IN : xlr 12m "A-02"',
    ];
    expect(cableSchedule(build(moulded).diagram)).toEqual([]);
    expect(cableSchedule(build(panelled).diagram).map((r) => r.label)).toEqual(['A-01', 'A-02']);
  });
});

describe('a length nobody has measured yet', () => {
  it('is written with the unit and no number', () => {
    // Leaving the length off already worked, and the blank it produced meant two things:
    // "not measured" and "nobody thought about it". Only one of those is a job to do.
    const { diagram, diagnostics } = build([
      'device a as mixer   { out L : xlr  out R : xlr }',
      'device b as speaker { in  L : xlr  in  R : xlr }',
      'a.L -> b.L : xlr ?m "A-01"',
      'a.R -> b.R : xlr    "A-02"',
    ]);
    expect(diagnostics).toEqual([]);

    const rows = cableSchedule(diagram);
    expect(rows[0]?.length).toBe('?m');
    expect(rows[1]?.length).toBeUndefined();
  });

  it('is still a length, so a radio path refuses it', () => {
    const { diagnostics } = build([
      'device a as transmitter { out RF : uhf }',
      'device b as receiver    { in  RF : uhf }',
      'a.RF -> b.RF : uhf ?m',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
  });

  it('makes an adapter end a socket, the same as a measured one', () => {
    const { diagram } = build([
      'device pc  as computer { out USB : usb }',
      'device mon as display  { in HDMI : hdmi }',
      'adapter dg "USB-HDMI" { in USB : usb  out HDMI : hdmi }',
      'pc.USB  -> dg.USB   : usb',
      'dg.HDMI -> mon.HDMI : hdmi ?m',
    ]);
    expect(cableSchedule(diagram)).toHaveLength(1);
  });

  it('takes any unit the language knows', () => {
    const { diagnostics } = build([
      'device a as mixer   { out L : xlr }',
      'device b as speaker { in  L : xlr }',
      'a.L -> b.L : xlr ?ft',
    ]);
    expect(diagnostics).toEqual([]);
  });
});

describe('a moulded lead that belongs on the cable schedule', () => {
  const FAN = [
    'device sw "卓" as mixer { out M : xlr }',
    'adapter fan "XLR 4分岐ケーブル" as cable 5m "C-01" {',
    '  in  IN : xlr',
    '  out A  : xlr',
    '  out B  : xlr',
    '}',
    'device s1 "SP1" as speaker { in IN : xlr }',
    'device s2 "SP2" as speaker { in IN : xlr }',
    'sw.M  -> fan.IN : xlr',
    'fan.A -> s1.IN  : xlr',
    'fan.B -> s2.IN  : xlr',
  ];

  it('gets one row, not one per plug', () => {
    // It is one object. Three rows would say three cables, which is the thing these
    // schedules exist to stop saying.
    const { diagram, diagnostics } = build(FAN);
    expect(diagnostics).toEqual([]);

    const rows = cableSchedule(diagram);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'C-01', length: '5m', fromDevice: 'XLR 4分岐ケーブル' });
  });

  it('says where it reaches, which is several places at once', () => {
    const rows = cableSchedule(build(FAN).diagram);
    expect(rows[0]?.toDevice).toBe('卓 / SP1 / SP2');
  });

  it('takes its connectors from the signals its ports carry', () => {
    expect(cableSchedule(build(FAN).diagram)[0]?.connectors).toEqual(['XLR-M', 'XLR-F']);
  });

  it('leaves the parts list, rather than appearing on both', () => {
    expect(adapterSchedule(build(FAN).diagram)).toEqual([]);
  });

  it('stays on the parts list without `as cable`', () => {
    const plain = FAN.map((l) => l.replace(' as cable 5m "C-01"', ''));
    expect(cableSchedule(build(plain).diagram)).toEqual([]);
    expect(adapterSchedule(build(plain).diagram).map((r) => r.adapter)).toEqual([
      'XLR 4分岐ケーブル',
    ]);
  });
});

describe('`as cable` has already answered the question', () => {
  const DONGLE = [
    'device pc "PC" as computer { out USB : usb }',
    'adapter dg "USB-HDMI 変換アダプタ" as cable {',
    '  in  USB  : usb',
    '  out HDMI : hdmi',
    '}',
    'device mon "モニター" as display { in HDMI : hdmi }',
    'pc.USB   -> dg.USB   : usb',
    'dg.HDMI  -> mon.HDMI : hdmi',
  ];

  it('is not told to write itself as `via`', () => {
    // The report says "this is one cable rather than a junction — write it as `via`". An
    // author who wrote `as cable` has said that already, in the way that also gives the
    // part a row and a number of its own.
    expect(build(DONGLE).diagnostics).toEqual([]);
  });

  it('still says so without it', () => {
    const plain = DONGLE.map((l) => l.replace(' as cable', ''));
    expect(build(plain).diagnostics.map((d) => d.code)).toContain('invalid-value');
  });

  it('lands on the cable schedule either way it is written', () => {
    const rows = cableSchedule(build(DONGLE).diagram);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fromDevice).toBe('USB-HDMI 変換アダプタ');
    expect(adapterSchedule(build(DONGLE).diagram)).toEqual([]);
  });
});
