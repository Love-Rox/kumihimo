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
    expect(hdmiToDvi?.note).toContain('変換');
    expect(hdmiToDvi?.adapter).toBe('HDMI-DVI 変換ケーブル');
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
  it('counts adapters across the whole system', () => {
    const rows = adapterSchedule(
      scheduleOf(`
        device pc1 as computer { out HDMI : hdmi }
        device pc2 as computer { out HDMI : hdmi }
        device m1 as display { in DVI : dvi }
        device m2 as display { in DVI : dvi }
        pc1.HDMI -> m1.DVI : hdmi "V-01"
        pc2.HDMI -> m2.DVI : hdmi "V-02"
      `),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adapter: 'HDMI-DVI 変換ケーブル', count: 2 });
    expect(rows[0]?.links).toEqual(['V-01', 'V-02']);
  });

  it('includes adapters the author never declared', () => {
    // An adapter nobody wrote down is an adapter nobody brings.
    const rows = adapterSchedule(scheduleOf(SOURCE));
    expect(rows.some((r) => r.adapter.includes('HDMI-DVI'))).toBe(true);
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
