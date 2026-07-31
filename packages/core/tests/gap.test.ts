import { describe, expect, it } from 'vitest';

import type { DeviceDecl } from '../src/ast.js';
import { buildModel } from '../src/build.js';
import { layoutDiagram } from '../src/layout.js';
import { parse } from '../src/parser.js';

/** Parse and assert nothing went wrong, returning the statements. */
function clean(source: string) {
  const { document, diagnostics } = parse(source);
  expect(diagnostics).toEqual([]);
  return document.statements;
}

async function portsOf(source: string) {
  const { diagram } = buildModel(parse(source).document);
  const laid = await layoutDiagram(diagram);
  const device = laid.devices.find((d) => d.id === 'sw')!;
  return {
    box: device.bounds,
    y: Object.fromEntries(device.ports.map((p) => [p.name, Math.round(p.center.y)])),
    x: Object.fromEntries(device.ports.map((p) => [p.name, Math.round(p.center.x)])),
  };
}

const PITCH = 22;
const STEP = PITCH / 2;

describe('gap parsing', () => {
  it('attaches to the declaration below it', () => {
    const [stmt] = clean('device sw {\n  in A : sdi\n  gap\n  in B : sdi\n}');
    const { ports } = stmt as DeviceDecl;
    expect(ports[0]?.gapBefore).toBeUndefined();
    expect(ports[1]?.gapBefore).toBe(1);
  });

  it('takes a count, and consecutive gaps add up', () => {
    const [stmt] = clean('device sw {\n  in A : sdi\n  gap 2\n  gap\n  in B : sdi\n}');
    const { ports } = stmt as DeviceDecl;
    expect(ports[1]?.gapBefore).toBe(3);
  });

  it('rejects a count below one rather than ignoring it', () => {
    const { diagnostics } = parse('device sw {\n  in A : sdi\n  gap 0\n  in B : sdi\n}');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('parse-error');
  });

  it('is dropped when nothing follows it, because a model may gain ports later', () => {
    const { diagnostics } = parse('model m {\n  in A : sdi\n  gap\n}');
    expect(diagnostics).toEqual([]);
  });

  it('survives into a device that instantiates the model', async () => {
    const source = [
      'model m as switcher {',
      '  in A : sdi',
      '  gap 2',
      '  in B : sdi',
      '}',
      'device sw from m',
    ].join('\n');
    const { y } = await portsOf(source);
    expect(y.B! - y.A!).toBe(PITCH + 2 * STEP);
  });
});

describe('gap layout', () => {
  const WITHOUT = [
    'device sw as switcher {',
    '  in  1..2 : hdmi',
    '  in  3..4 : sdi',
    '  out PGM    : sdi',
    '  out STREAM : lan',
    '}',
  ].join('\n');

  const WITH = [
    'device sw as switcher {',
    '  in  1..2 : hdmi',
    '  gap',
    '  in  3..4 : sdi',
    '  out PGM    : sdi',
    '  gap 2',
    '  out STREAM : lan',
    '}',
  ].join('\n');

  it('leaves the spacing alone where no gap is written', async () => {
    const { y } = await portsOf(WITHOUT);
    expect(y['2']! - y['1']!).toBe(PITCH);
    expect(y['3']! - y['2']!).toBe(PITCH);
    expect(y.STREAM! - y.PGM!).toBe(PITCH);
  });

  it('opens half a pitch per step, above the port that asked for it', async () => {
    const { y } = await portsOf(WITH);
    expect(y['2']! - y['1']!).toBe(PITCH);
    expect(y['3']! - y['2']!).toBe(PITCH + STEP);
    expect(y['4']! - y['3']!).toBe(PITCH);
    expect(y.STREAM! - y.PGM!).toBe(PITCH + 2 * STEP);
  });

  it('only the first port of a range starts the new block', async () => {
    const source = [
      'device sw as switcher {',
      '  in A : sdi',
      '  gap',
      '  in CH[1..3] : xlr',
      '}',
    ].join('\n');
    const { y } = await portsOf(source);
    expect(y.CH1! - y.A!).toBe(PITCH + STEP);
    expect(y.CH2! - y.CH1!).toBe(PITCH);
    expect(y.CH3! - y.CH2!).toBe(PITCH);
  });

  it('grows the box so the last port still sits inside it', async () => {
    const plain = await portsOf(WITHOUT);
    const gapped = await portsOf(WITH);
    // The deeper of the two strips decides: inputs gain one step, outputs two.
    expect(gapped.box.height - plain.box.height).toBe(2 * STEP);
    const lowest = Math.max(...Object.values(gapped.y));
    expect(lowest).toBeLessThan(gapped.box.y + gapped.box.height);
  });

  it('widens rather than lengthens when the diagram runs top to bottom', async () => {
    const source = ['diagram { direction: TB }', WITH].join('\n');
    const { x, box } = await portsOf(source);
    expect(x['3']! - x['2']!).toBeGreaterThan(x['2']! - x['1']!);
    const rightmost = Math.max(...Object.values(x));
    expect(rightmost).toBeLessThan(box.x + box.width);
  });
});
