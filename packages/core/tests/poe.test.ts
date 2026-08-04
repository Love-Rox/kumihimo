/**
 * Power sharing the Cat lead.
 *
 * Not a second cable and not a second run: draw it as two links and the schedule shows two
 * 30m Cat leads where one exists, and somebody loads the van accordingly.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { compile } from '../src/compile.js';
import { cableSchedule, readableSchedules } from '../src/schedule.js';

function build(lines: readonly string[]) {
  const { document, diagnostics: parsed } = parse(lines.join('\n'));
  const { diagram, diagnostics: built } = buildModel(document);
  return { diagram, diagnostics: [...parsed, ...built] };
}

const RIG = [
  'device sw  "PoE スイッチ" as switcher { io LAN1, LAN2 : lan }',
  'device cam "PoE カメラ"   as camera   { io LAN : lan }',
  'device ap  "AP"           as router   { io LAN : lan }',
  'sw.LAN1 <-> cam.LAN : lan 30m "N-01" [poe]',
  'sw.LAN2 <-> ap.LAN  : lan 15m "N-02"',
];

describe('`[poe]`', () => {
  it('is a flag, written without a value', () => {
    // `[poe=true]` would parse too, but there is nothing to put on the other side of an `=`
    // that reads better than saying it once.
    const { diagram, diagnostics } = build(RIG);
    expect(diagnostics).toEqual([]);
    expect(diagram.links[0]?.poe).toBe(true);
    expect(diagram.links[1]?.poe).toBeUndefined();
  });

  it('leaves one cable on the schedule, not two', () => {
    // The whole point. Power and Ethernet share the lead; two rows means two leads packed.
    const rows = cableSchedule(build(RIG).diagram);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.label === 'N-01')?.poe).toBe(true);
    expect(rows.find((r) => r.label === 'N-02')?.poe).toBeUndefined();
  });

  it('is drawn on the run', () => {
    // Written down and not shown is the same as not written down. It joins the number and
    // the length rather than getting a line of its own.
    return compile(RIG.join('\n')).then(({ svg }) => {
      expect(svg).toContain('N-01  30m  PoE');
      expect(svg).toContain('N-02  15m');
    });
  });

  it('says `あり`, not `未宣言`', async () => {
    // The word for a true in this column is its own. The one that came before it belongs to
    // a device nobody declared, and printing it here says the opposite of what is meant.
    const sheet = readableSchedules(build(RIG).diagram, 'ja').find((s) => s.kind === 'cable');
    expect(sheet?.rows.find((r) => r[0] === 'N-01')).toContain('あり');
    expect(sheet?.rows.flat()).not.toContain('未宣言');
  });

  it('grows no column on a show that has none', async () => {
    const plain = RIG.map((l) => l.replace(' [poe]', ''));
    const sheet = readableSchedules(build(plain).diagram, 'ja').find((s) => s.kind === 'cable');
    expect(sheet?.head).not.toContain('給電');
  });

  it('is refused on a run that is not Cat', () => {
    // Nothing puts power down an SDI coax, and an author who wrote it there meant something
    // else. Reported rather than quietly drawn.
    const { diagram, diagnostics } = build([
      'device s "S" as switcher { out O : sdi }',
      'device r "R" as recorder { in I : sdi }',
      's.O -> r.I : sdi 30m "V-01" [poe]',
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
    expect(diagnostics[0]?.message).toContain('SDI');
    expect(diagram.links[0]?.poe).toBeUndefined();
  });

  it('rides along with whatever else the Cat lead is carrying', () => {
    // NDI over Cat is still a Cat lead, and a powered camera on it is an ordinary thing.
    const { diagram, diagnostics } = build([
      'device cam "Cam" as camera { io W : ndi }',
      'device sw  "SW"  as router { io 1 : ndi }',
      'cam.W <-> sw.1 : ndi over lan 30m "N-01" [poe]',
    ]);
    expect(diagnostics).toEqual([]);
    expect(diagram.links[0]?.poe).toBe(true);
  });
});
