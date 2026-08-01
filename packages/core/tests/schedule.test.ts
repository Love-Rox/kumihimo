import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { localise } from '../src/messages.js';
import { BUILTIN_SIGNALS } from '../src/signals.js';
import {
  SCHEDULES,
  SCHEDULE_KINDS,
  adapterSchedule,
  cableSchedule,
  equipmentSchedule,
  readableSchedules,
  toTsv,
  wirelessSchedule,
} from '../src/schedule.js';

const SOURCE = `
group rack "ラック" {
  device sw "スイッチャー" as switcher { out PGM : sdi  out AUX : hdmi }
  device rec "レコーダー"  as recorder { in SDI : sdi }
  device mon "モニター"    as display  { in DVI : dvi }
  @model "x"
}
device mic "マイク" as microphone { out RF : uhf }
device rx  "受信機" as interface  { in RF : uhf }

sw.PGM  -> rec.SDI : sdi 2m "V-10" [color=青]
sw.AUX  -> mon.DVI : hdmi 3m "V-11"
mic.RF  -> rx.RF   : uhf [ch=38]
`;

function scheduleOf(source: string) {
  return buildModel(parse(source).document).diagram;
}

describe('cableSchedule', () => {
  it('lists every cable with its endpoints resolved to drawn names', () => {
    const rows = cableSchedule(scheduleOf(SOURCE));
    // Two, not three. The source has three links and one of them is a radio path.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      label: 'V-10',
      from: 'sw.PGM',
      fromDevice: 'スイッチャー',
      to: 'rec.SDI',
      toDevice: 'レコーダー',
      signal: 'sdi',
      length: '2m',
      color: '#2563eb',
    });
  });

  it('carries the connectors to terminate with', () => {
    // Every shell the signal comes in, for an export to sort and filter on. Reading it off
    // `BUILTIN_SIGNALS` rather than restating the list keeps this a test of the schedule
    // instead of a second copy of the vocabulary that has to be edited whenever a shell
    // is added.
    const rows = cableSchedule(scheduleOf(SOURCE));
    expect(rows[0]?.connectors).toEqual(BUILTIN_SIGNALS['sdi']?.connectors);
    expect(rows[0]?.connectors).toContain('BNC');
  });

  it('leaves radio paths off, because nothing here is coiled', () => {
    // The sheet is what somebody packs a van from. A row with no length, no connector and
    // nothing to pull reads as a cable that was never measured.
    const rows = cableSchedule(scheduleOf(SOURCE));
    expect(rows.map((r) => r.from)).not.toContain('mic.RF');
    expect(rows.every((r) => r.connectors.length > 0)).toBe(true);
  });

  it('notes why a run was flagged', () => {
    const rows = cableSchedule(scheduleOf(SOURCE));
    const hdmiToDvi = rows.find((r) => r.to === 'mon.DVI');
    expect(hdmiToDvi?.note).toContain('Needs HDMI-DVI cable');
    expect(hdmiToDvi?.adapter).toBe('HDMI-DVI cable');
  });
});

describe('equipmentSchedule', () => {
  it('lists devices with their group, port count and metadata', () => {
    const rows = equipmentSchedule(scheduleOf(SOURCE));
    const sw = rows.find((r) => r.id === 'sw');
    expect(sw).toMatchObject({
      label: 'スイッチャー',
      kind: 'switcher',
      group: 'ラック',
      ports: 2,
    });
  });

  it('flags a device that only exists because a link named it', () => {
    const rows = equipmentSchedule(scheduleOf('a.X -> b.Y'));
    expect(rows.every((r) => r.implicit)).toBe(true);
  });
});

describe('adapterSchedule', () => {
  it('counts a part that sits beside a cable', () => {
    // Both ends are SDI, so the run needs an ordinary cable *and* the adapter named on
    // it. Two objects, and the second one is what this schedule is for.
    const rows = adapterSchedule(
      scheduleOf(`
        device c1 as camera { out SDI : sdi }
        device c2 as camera { out SDI : sdi }
        device m1 as display { in SDI : sdi }
        device m2 as display { in SDI : sdi }
        c1.SDI -> m1.SDI : sdi 30m "V-01" via "BNC-RCA adapter"
        c2.SDI -> m2.SDI : sdi 30m "V-02" via "BNC-RCA adapter"
      `),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adapter: 'BNC-RCA adapter', count: 2 });
    expect(rows[0]?.links).toEqual(['V-01', 'V-02']);
  });

  it('leaves a converting lead off, because the cable is the lead', () => {
    // HDMI into DVI needs a converting lead, and that lead *is* the run. A row here as
    // well would send someone to site with two objects for a job that needs one.
    const rows = adapterSchedule(
      scheduleOf(`
        device pc as computer { out HDMI : hdmi }
        device m  as display  { in DVI : dvi }
        pc.HDMI -> m.DVI : hdmi 2m "V-01" via "HDMI-DVI cable"
      `),
    );
    expect(rows).toEqual([]);
  });

  it('still names the part on the cable, declared or not', () => {
    // The intent that matters: a lead nobody wrote down is a lead nobody brings. It
    // reaches the reader on the run's own row, which is where the ordering happens.
    const rows = cableSchedule(scheduleOf(SOURCE));
    const converting = rows.find((r) => r.label === 'V-11');
    expect(converting?.adapter).toContain('HDMI-DVI');
  });

  it('is empty when nothing needs one', () => {
    expect(adapterSchedule(scheduleOf('a.X -> b.Y : sdi 2m'))).toEqual([]);
  });
});

describe('toTsv', () => {
  it('emits a header and one row per entry', () => {
    const tsv = toTsv(cableSchedule(scheduleOf(SOURCE)), ['label', 'from', 'to', 'length']);
    const lines = tsv.split('\n');
    expect(lines[0]).toBe('label\tfrom\tto\tlength');
    // A header and the two cables. The radio path is on its own sheet.
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('V-10\tsw.PGM\trec.SDI\t2m');
  });

  it('flattens arrays and objects rather than printing [object Object]', () => {
    const tsv = toTsv(cableSchedule(scheduleOf(SOURCE)), ['connectors']);
    expect(tsv).toContain('BNC');
    expect(tsv).not.toContain('[object');
  });

  it('never lets a value break the row structure', () => {
    const tsv = toTsv([{ a: 'x\ty\nz' }], ['a']);
    expect(tsv.split('\n')).toHaveLength(2);
  });
});

describe('wirelessSchedule', () => {
  it('has the radio path the cable schedule no longer carries', () => {
    const rows = wirelessSchedule(scheduleOf(SOURCE));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      from: 'mic.RF',
      fromDevice: 'マイク',
      to: 'rx.RF',
      toDevice: '受信機',
      signal: 'uhf',
      frequency: 'ch 38',
    });
  });

  it('says what the signal is riding on, when that is a different thing', () => {
    // NDI over Wi-Fi: the name belongs to the payload, the frequency to the carrier, which
    // is the whole reason they are separate columns.
    const rows = wirelessSchedule(
      scheduleOf(
        [
          'device cam "カメラ" as camera { out W : ndi }',
          'device ap "AP" as router { io W : ndi }',
          'cam.W -> ap.W : ndi over wifi [ch=36]',
        ].join('\n'),
      ),
    );
    expect(rows[0]).toMatchObject({ signal: 'ndi', carrier: 'wifi', frequency: 'ch 36' });
  });

  it('says nothing about a carrier when the signal is its own', () => {
    // "uhf, riding on uhf" is noise. The column answers "what is it going over", which
    // needs no answer here.
    expect(wirelessSchedule(scheduleOf(SOURCE))[0]?.carrier).toBeUndefined();
  });

  it('is empty for a diagram with nothing in the air', () => {
    const wired =
      'device a "A" as camera { out O : sdi }\ndevice b "B" as recorder { in I : sdi }\na.O -> b.I : sdi 2m "V-01"';
    expect(wirelessSchedule(scheduleOf(wired))).toEqual([]);
  });

  it('carries a number when one was written, since RF paths get numbered too', () => {
    const numbered = SOURCE.replace(
      'mic.RF  -> rx.RF   : uhf [ch=38]',
      'mic.RF -> rx.RF : uhf [ch=38] "RF-01"',
    );
    expect(wirelessSchedule(scheduleOf(numbered))[0]?.label).toBe('RF-01');
  });
});

describe('the schedule registry', () => {
  // A show with one of everything, so every row type has a row and every optional
  // property that can be filled is filled.
  const EVERYTHING = [
    'device mic "マイク"   as microphone { out RF : uhf }',
    'device rx  "受信機"   as interface  { in RF : uhf  out CH1 : xlr }',
    'device dk  "卓"       as mixer      { in CH1 : xlr  out MAIN : xlr }',
    'device cam "カメラ"   as camera     { out W : ndi }',
    'device ap  "AP"       as router     { io W : ndi  out LAN : ndi }',
    'device pc  "PC"       as recorder   { in LAN : ndi }',
    'adapter pp "分配パネル" { in IN : xlr  out A : xlr }',
    'device sp  "SP"       as speaker    { in IN : xlr }',
    '',
    'mic.RF   -> rx.RF   : uhf [ch=38]',
    'rx.CH1   -> dk.CH1  : xlr 3m "A-01" [color=青]',
    'cam.W    -> ap.W    : ndi over wifi [ch=36]',
    'ap.LAN   -> pc.LAN  : ndi over lan 20m "N-01"',
    'dk.MAIN  -> pp.IN   : xlr 10m "A-02"',
    'pp.A     -> sp.IN   : xlr 5m  "A-03"',
  ].join('\n');

  it('covers every kind', () => {
    expect([...SCHEDULE_KINDS].sort()).toEqual(['adapter', 'cable', 'equipment', 'wireless']);
    for (const kind of SCHEDULE_KINDS) expect(SCHEDULES[kind]).toBeDefined();
  });

  it('has a column for every property the rows actually carry', () => {
    // The failure this exists to catch: a field added to a row type and not to the column
    // list. Nothing else notices — the row carries it, every table quietly drops it, and
    // the first person to find out is whoever needed that column on site.
    const diagram = scheduleOf(EVERYTHING);

    for (const kind of SCHEDULE_KINDS) {
      const schedule = SCHEDULES[kind];
      const declared = new Set(schedule.columns.map((column) => column.key));
      const produced = new Set(schedule.rows(diagram, 'ja').flatMap((row) => Object.keys(row)));

      const missing = [...produced].filter((key) => !declared.has(key));
      expect(missing, `${kind} の行にあって列にない項目`).toEqual([]);
    }
  });

  it('names every column in both languages', () => {
    for (const kind of SCHEDULE_KINDS) {
      const schedule = SCHEDULES[kind];
      for (const locale of ['en', 'ja'] as const) {
        expect(localise(schedule.title, locale), `${kind} の表題 (${locale})`).not.toBe('');
        for (const column of schedule.columns) {
          if (column.head === undefined) continue;
          expect(localise(column.head, locale), `${kind}.${column.key} (${locale})`).not.toBe('');
        }
      }
    }
  });

  it('returns the same rows as the function it wraps', () => {
    // The registry is a second way to reach the same data, and two ways to reach one thing
    // is one way for them to disagree.
    const diagram = scheduleOf(EVERYTHING);
    expect(SCHEDULES.cable.rows(diagram, 'ja')).toEqual(cableSchedule(diagram, 'ja'));
    expect(SCHEDULES.wireless.rows(diagram, 'ja')).toEqual(wirelessSchedule(diagram, 'ja'));
    expect(SCHEDULES.equipment.rows(diagram)).toEqual(equipmentSchedule(diagram));
    expect(SCHEDULES.adapter.rows(diagram, 'ja')).toEqual(adapterSchedule(diagram, 'ja'));
  });
});

describe('readableSchedules', () => {
  const SHOW = [
    'device mic "SM58" as microphone { out OUT : xlr }',
    'device dk  "卓"   as mixer      { in CH1 : xlr [connector=XLR-F]  out MAIN : xlr [connector=XLR-M] }',
    'device sp  "SP"   as speaker    { in IN  : xlr [connector=XLR-F] }',
    'mic.OUT -> dk.CH1 : xlr 10m "A-01"',
    'dk.MAIN -> sp.IN  : xlr 15m "A-02"',
  ].join('\n');

  const cable = (locale: 'en' | 'ja' = 'ja') =>
    readableSchedules(scheduleOf(SHOW), locale).find((sheet) => sheet.kind === 'cable');

  it('leaves out a column the row beside it already decides', () => {
    // Which shells XLR comes in is a fact about XLR, and the row says XLR. Every cable
    // row would carry the same six names — the `SDI sdi` stutter one level up.
    const column = SCHEDULES.cable.columns.find((c) => c.key === 'connectors');
    expect(column?.dataOnly).toBe(true);
    const sheet = cable();
    expect(sheet?.head).not.toContain(localise(column!.head!, 'ja'));
    expect(sheet?.rows.flat().join(' ')).not.toContain('Mini XLR');
  });

  it('keeps the ends this particular run terminates in', () => {
    // The precise fact survives the column that was only ever a hint. A desk output
    // declared male takes a female cable end, and that is worth a column.
    const sheet = cable();
    expect(sheet?.rows.find((row) => row[0] === 'A-02')).toContain('XLR-F');
  });

  it('still exports the column it does not print', () => {
    // Dropped from the page, not from the data: a spreadsheet column nobody can get back
    // is a different kind of loss from a page that is a little wider than it needs to be.
    const tsv = toTsv(cableSchedule(scheduleOf(SHOW)), ['connectors']);
    expect(tsv).toContain('Mini XLR-4F');
  });

  it('gives every sheet as many cells per row as it has headings', () => {
    // A row longer than the head is a table that renders with a cell in no column at all.
    for (const sheet of readableSchedules(scheduleOf(SHOW), 'en')) {
      for (const row of sheet.rows) expect(row, sheet.kind).toHaveLength(sheet.head.length);
    }
  });
});
