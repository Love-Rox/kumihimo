import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { adapterSchedule, cableSchedule, equipmentSchedule, toTsv } from '../src/schedule.js';

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
  it('lists every link with its endpoints resolved to drawn names', () => {
    const rows = cableSchedule(scheduleOf(SOURCE));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      label: 'V-10',
      from: 'sw.PGM',
      fromDevice: 'スイッチャー',
      to: 'rec.SDI',
      toDevice: 'レコーダー',
      signal: 'sdi',
      medium: 'cable',
      length: '2m',
      color: '#2563eb',
    });
  });

  it('carries the connectors to terminate with', () => {
    const rows = cableSchedule(scheduleOf(SOURCE));
    expect(rows[0]?.connectors).toEqual(['BNC']);
  });

  it('records a radio path as wireless, with frequency instead of length', () => {
    const rows = cableSchedule(scheduleOf(SOURCE));
    const radio = rows.find((r) => r.medium === 'wireless');
    expect(radio?.frequency).toBe('ch 38');
    expect(radio?.length).toBeUndefined();
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
    expect(lines).toHaveLength(4);
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
