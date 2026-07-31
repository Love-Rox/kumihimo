import { describe, expect, it } from 'vitest';

import type { DeviceDecl } from '../src/ast.js';
import { buildModel } from '../src/build.js';
import { parse } from '../src/parser.js';

function clean(source: string) {
  const { document, diagnostics } = parse(source);
  expect(diagnostics).toEqual([]);
  return document.statements;
}

function build(source: string) {
  const { diagram, diagnostics } = buildModel(parse(source).document);
  return { diagram, diagnostics };
}

const DESK = [
  'device mic  "SM58"  as microphone { out OUT : xlr }',
  'device di   "DI"    as generic    { out OUT : trs }',
  'device cdp  "CDP"   as player     { out OUT : rca }',
  'device desk "DM3"   as mixer      { in COMBO : xlr | trs  in LINE : trs }',
].join('\n');

describe('a connector that accepts more than one thing', () => {
  it('keeps both types, in the order written', () => {
    const [stmt] = clean('device d { in A : xlr | trs }');
    expect((stmt as DeviceDecl).ports[0]?.signals).toEqual(['xlr', 'trs']);
  });

  it('is drawn and reported as the first one', () => {
    const { diagram } = build('device d as mixer { in A : xlr | trs }');
    const port = diagram.devices[0]?.ports[0];
    expect(port?.signal).toBe('xlr');
    expect(port?.accepts).toEqual(['xlr', 'trs']);
  });

  it('records no alternatives when only one type is declared', () => {
    const { diagram } = build('device d as mixer { in A : xlr }');
    expect(diagram.devices[0]?.ports[0]?.accepts).toBeUndefined();
  });

  it('reports a typo in any position, not just the first', () => {
    const { diagnostics } = build('device d as mixer { in A : xlr | tsr }');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('unknown-signal');
    expect(diagnostics[0]?.message).toContain('tsr');
  });

  it('takes either of the things it accepts', () => {
    const xlr = build(`${DESK}\nmic.OUT -> desk.COMBO : xlr`);
    const trs = build(`${DESK}\ndi.OUT -> desk.COMBO : trs`);
    expect(xlr.diagnostics).toEqual([]);
    expect(trs.diagnostics).toEqual([]);
  });

  it('still judges what it does not accept', () => {
    // RCA into a combo jack: unbalanced consumer level into a mic/line input.
    const { diagnostics } = build(`${DESK}\ncdp.OUT -> desk.COMBO : rca`);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('is judged by the type the cable names, when the jack accepts it', () => {
    // The jack takes both; the cable is what says which hole is in use. `trs` names one
    // the jack accepts, so that is the end being judged — not the first declared.
    const { diagram } = build(`${DESK}\ndi.OUT -> desk.COMBO : trs`);
    expect(diagram.links[0]?.signal.name).toBe('trs');
  });

  it('leaves a single-type port judged the same way it always was', () => {
    const { diagnostics } = build(`${DESK}\ncdp.OUT -> desk.LINE : rca`);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('USB PD', () => {
  const HUB = [
    'device pc  "ノートPC" as computer { io  USBC : usb }',
    'device mon "モニター" as display  { in  PWR  : usbpd }',
  ].join('\n');

  it('is its own type, in the power category', async () => {
    const { BUILTIN_SIGNALS } = await import('../src/signals.js');
    expect(BUILTIN_SIGNALS.usbpd?.category).toBe('power');
    expect(BUILTIN_SIGNALS.usbpd?.connectors).toContain('USB-C');
  });

  it('wires freely with usb, the way poe does with lan', () => {
    const { diagnostics } = build(`${HUB}\npc.USBC -> mon.PWR : usbpd 1m "P-01"`);
    expect(diagnostics).toEqual([]);
  });
});
