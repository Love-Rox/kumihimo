/**
 * Which connector is on the box, and what that makes the cable ends.
 *
 * Gender is a property of the socket, not of the cable. Written on the port, every cable
 * reaching that port agrees with it for free — and the author writes it once per socket
 * rather than once per run, so the two can never come to disagree.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';
import { cableSchedule } from '../src/schedule.js';
import { BUILTIN_SIGNALS, mateOf } from '../src/signals.js';

function build(lines: readonly string[]) {
  const { document, diagnostics: parsed } = parse(lines.join('\n'));
  const { diagram, diagnostics: built } = buildModel(document);
  return { diagram, diagnostics: [...parsed, ...built] };
}

describe('mateOf', () => {
  it('gives the opposite gender for a gendered pair', () => {
    const xlr = BUILTIN_SIGNALS['xlr']!;
    expect(xlr.gendered).toBe(true);
    expect(mateOf(xlr, 'XLR-M')).toBe('XLR-F');
    expect(mateOf(xlr, 'XLR-F')).toBe('XLR-M');
  });

  it('gives the same name for everything else', () => {
    // `usb` lists A, B and C as *alternatives*, not as a pair. A USB-C lead ends in a
    // USB-C plug; there is no opposite to reach for.
    const usb = BUILTIN_SIGNALS['usb']!;
    expect(usb.gendered).toBeUndefined();
    expect(mateOf(usb, 'USB-C')).toBe('USB-C');
  });

  it('stays inside its own pair when the type has several', () => {
    // The rule used to be "the other entry", which was the same answer while there was one
    // pair and the wrong one the moment there were three: a mini plug asked for a
    // full-size socket, and nobody sells that lead.
    const xlr = BUILTIN_SIGNALS['xlr']!;
    expect(mateOf(xlr, 'Mini XLR-M')).toBe('Mini XLR-F');
    expect(mateOf(xlr, 'Mini XLR-F')).toBe('Mini XLR-M');
    expect(mateOf(xlr, 'Mini XLR-4F')).toBe('Mini XLR-4M');
    // Still true for the pair that was always there.
    expect(mateOf(xlr, 'XLR-M')).toBe('XLR-F');
  });

  it('lists a gendered type in pairs, male first in each', () => {
    // What `mateOf` reads off the order, stated as the thing it is. An entry that slipped
    // out of order would pair a plug with the wrong shell and nothing else would notice.
    for (const signal of Object.values(BUILTIN_SIGNALS)) {
      if (signal.gendered !== true) continue;
      expect(signal.connectors.length % 2, signal.name).toBe(0);
      for (let i = 0; i < signal.connectors.length; i += 2) {
        expect(signal.connectors[i], signal.name).toMatch(/M$/);
        expect(signal.connectors[i + 1], signal.name).toMatch(/F$/);
      }
    }
  });

  it('marks only the type whose list is a pair', () => {
    // The list means "one of these" everywhere else, and two meanings in one field is a
    // trap for whoever reads a schedule having learned the other one.
    const gendered = Object.values(BUILTIN_SIGNALS)
      .filter((s) => s.gendered === true)
      .map((s) => s.name);
    expect(gendered).toEqual(['xlr']);
  });
});

describe('a connector written on a port', () => {
  const DESK = [
    'device dk  "卓"     as mixer     { out MAIN : xlr [connector=XLR-M] }',
    'device sp  "SP"     as speaker   { in  IN   : xlr [connector=XLR-F] }',
    'device amp "アンプ" as amplifier { in  IN   : xlr }',
    'dk.MAIN -> sp.IN  : xlr 10m "A-01"',
    'dk.MAIN -> amp.IN : xlr 12m "A-02"',
  ];

  it('makes the cable end the one that mates with it', () => {
    const { diagram, diagnostics } = build(DESK);
    expect(diagnostics).toEqual([]);

    const row = cableSchedule(diagram).find((r) => r.label === 'A-01');
    // A male output takes a female cable end, and a female input takes a male one.
    expect(row?.fromConnector).toBe('XLR-F');
    expect(row?.toConnector).toBe('XLR-M');
  });

  it('says nothing about an end whose port said nothing', () => {
    const row = cableSchedule(build(DESK).diagram).find((r) => r.label === 'A-02');
    expect(row?.fromConnector).toBe('XLR-F');
    expect(row?.toConnector).toBeUndefined();
  });

  it('reaches every port a range expands into', () => {
    // The point of writing it on the port: a desk with sixteen outputs says it once.
    const { diagram } = build([
      'device dk "卓" as mixer { out CH[1..16] : xlr [connector=XLR-M] }',
    ]);
    const ports = diagram.devices[0]!.ports;
    expect(ports).toHaveLength(16);
    expect(ports.every((p) => p.connector === 'XLR-M')).toBe(true);
  });

  it('lets a turnaround be written as the thing it is', () => {
    // A male-to-male barrel: both ends the same gender, which is exactly why it exists.
    const { diagram, diagnostics } = build([
      'device a "A" as mixer   { out O : xlr [connector=XLR-M] }',
      'adapter tt "XLR オス-オス中継" { in I : xlr [connector=XLR-F]  out O : xlr [connector=XLR-F] }',
      'device b "B" as speaker { in I : xlr [connector=XLR-F] }',
      'a.O  -> tt.I : xlr',
      'tt.O -> b.I  : xlr 5m "A-01"',
    ]);
    expect(diagnostics).toEqual([]);
    const row = cableSchedule(diagram).find((r) => r.label === 'A-01');
    expect(row?.fromConnector).toBe('XLR-M');
    expect(row?.toConnector).toBe('XLR-M');
  });

  it('rejects a connector the signal type does not have', () => {
    const { diagnostics } = build(['device d as mixer { out A : xlr [connector=XLR-Z] }']);
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
    expect(diagnostics[0]?.message).toContain('XLR-M / XLR-F');
  });

  it('rejects an attribute a port does not understand', () => {
    // A run's `[…]` list is kept as free-form extra data, so an unknown key there survives
    // for whoever wants it. A port's is not, so a typo goes nowhere — and says so.
    const { diagnostics } = build(['device d as mixer { out A : xlr [conector=XLR-M] }']);
    expect(diagnostics[0]?.message).toContain('conector');
  });

  it('lets a small HDMI shell be a connector rather than a signal of its own', () => {
    // Mini and micro are the same signal on a smaller shell, so a camera plugged into a
    // switcher has to come out clean. Typing them would have reported a mismatch on a
    // connection that works, which is the one thing this validator must never do.
    //
    // The reason to write them at all is the schedule: `HDMI Micro → HDMI` is a lead you
    // either packed or did not.
    const { diagram, diagnostics } = build([
      'device cam "α7 IV"     as camera   { out HDMI  : hdmi [connector="HDMI Micro"] }',
      'device sw  "ATEM Mini" as switcher { in  HDMI1 : hdmi [connector=HDMI] }',
      'cam.HDMI -> sw.HDMI1 : hdmi 3m "V-01"',
    ]);
    expect(diagnostics).toEqual([]);
    const [run] = cableSchedule(diagram);
    expect(run?.fromConnector).toBe('HDMI Micro');
    expect(run?.toConnector).toBe('HDMI');
  });

  it('still refuses a shell HDMI does not come in', () => {
    const { diagnostics } = build(['device x "X" { out V : hdmi [connector="HDMI Nano"] }']);
    // Naming all three is what makes the message useful: it reads as "you have the name
    // slightly off" rather than as "mini is not a thing".
    expect(diagnostics[0]?.message).toContain('HDMI Mini');
    expect(diagnostics[0]?.message).toContain('HDMI Micro');
  });

  it('ignores a port connector belonging to another of a combo jack signals', () => {
    // A combo jack declared `xlr | trs` and marked XLR-F says nothing about a TRS run
    // through it, so the schedule stays quiet rather than guessing.
    const { diagram } = build([
      'device a "A" as mixer  { out O : trs }',
      'device d "D" as mixer  { in  A : xlr | trs [connector=XLR-F] }',
      'a.O -> d.A : trs 3m "A-01"',
    ]);
    expect(cableSchedule(diagram)[0]?.toConnector).toBeUndefined();
  });
});
