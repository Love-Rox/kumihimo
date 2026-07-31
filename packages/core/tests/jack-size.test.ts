import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { BUILTIN_SIGNALS } from '../src/signals.js';
import { parse } from '../src/parser.js';

/** Wire one port to another and report what the compiler made of it. */
function link(from: string, to: string, via?: string) {
  const source = [
    `device a as generic { out OUT : ${from} }`,
    `device b as generic { in  IN  : ${to} }`,
    `a.OUT -> b.IN${via ? ` via "${via}"` : ''}`,
  ].join('\n');
  const { diagnostics } = buildModel(parse(source).document);
  return diagnostics.map((d) => `${d.code}: ${d.message}`);
}

describe('jack types carry their barrel size', () => {
  it('names one connector each, not a choice of two', () => {
    expect(BUILTIN_SIGNALS.trs?.connectors).toEqual(['TRS 1/4"']);
    expect(BUILTIN_SIGNALS.trs35?.connectors).toEqual(['TRS 3.5mm']);
    expect(BUILTIN_SIGNALS.trrs?.connectors).toEqual(['TRRS 1/4"']);
    expect(BUILTIN_SIGNALS.trrs35?.connectors).toEqual(['TRRS 3.5mm']);
  });

  it('follows one rule for the suffix: bare is 1/4", 35 is 3.5mm', () => {
    expect(BUILTIN_SIGNALS.trs?.label).toContain('1/4"');
    expect(BUILTIN_SIGNALS.trrs?.label).toContain('1/4"');
    expect(BUILTIN_SIGNALS.trs35?.label).toContain('3.5mm');
    expect(BUILTIN_SIGNALS.trrs35?.label).toContain('3.5mm');
  });
});

describe('different barrel, same signal', () => {
  it('asks for the adapter, and names it', () => {
    const found = link('trs', 'trs35');
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('adapter-required');
    expect(found[0]).toContain('3.5mm-6.3mm');
  });

  it('is satisfied once the adapter is declared', () => {
    expect(link('trs', 'trs35', '3.5mm-6.3mm 変換プラグ')).toEqual([]);
  });

  it('warns that a 3-pole adapter will not do for a 4-pole run', () => {
    const found = link('trrs', 'trrs35');
    expect(found[0]).toContain('4極対応品');
  });
});

describe('different pole count, same barrel', () => {
  it('says what is lost when four poles meet three', () => {
    const found = link('trrs35', 'trs35');
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('マイクは通らず');
  });

  it('says what is missing when three poles meet four', () => {
    const found = link('trs35', 'trrs35');
    expect(found[0]).toContain('マイクの極が繋がらない');
  });

  it('applies at 1/4" as well as at 3.5mm', () => {
    expect(link('trrs', 'trs')[0]).toContain('マイクは通らず');
  });
});

describe('what the split fixed', () => {
  it('no longer calls XLR to a 3.5mm jack unremarkable', () => {
    // `xlr` and `trs` are interchangeable — an XLR-to-1/4" cable is a stock item.
    expect(link('xlr', 'trs')).toEqual([]);
    // The same claim for 3.5mm was never true, and used to pass because one `trs` type
    // stood for both sizes.
    expect(link('xlr', 'trs35').length).toBeGreaterThan(0);
  });
});
