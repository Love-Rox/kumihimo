import { describe, expect, it } from 'vitest';

import { tokenize } from '../src/lexer.js';

/** Token types and values, dropping spans, for compact assertions. */
function shape(source: string): [string, string][] {
  return tokenize(source)
    .filter((t) => t.type !== 'eof')
    .map((t) => [t.type, t.value]);
}

describe('tokenize', () => {
  it('splits a connection into ports, arrow and modifiers', () => {
    expect(shape('cam1.SDI -> sw.1 : sdi 10m "V-01"')).toEqual([
      ['ident', 'cam1'],
      ['dot', '.'],
      ['ident', 'SDI'],
      ['arrow', '->'],
      ['ident', 'sw'],
      ['dot', '.'],
      ['number', '1'],
      ['colon', ':'],
      ['ident', 'sdi'],
      ['measure', '10m'],
      ['string', 'V-01'],
    ]);
  });

  it('recognises all three arrows', () => {
    expect(shape('a -> b')[1]).toEqual(['arrow', '->']);
    expect(shape('a <-> b')[1]).toEqual(['arrow', '<->']);
    expect(shape('a -- b')[1]).toEqual(['arrow', '--']);
  });

  it('keeps hyphens inside identifiers but not when an arrow follows', () => {
    expect(shape('cam-1->sw-a')).toEqual([
      ['ident', 'cam-1'],
      ['arrow', '->'],
      ['ident', 'sw-a'],
    ]);
  });

  it('distinguishes a range from a decimal', () => {
    expect(shape('1..4')).toEqual([
      ['number', '1'],
      ['range', '..'],
      ['number', '4'],
    ]);
    expect(shape('2.5m')).toEqual([['measure', '2.5m']]);
  });

  it('only treats a known unit as a measure', () => {
    expect(shape('10m')).toEqual([['measure', '10m']]);
    expect(shape('30cm')).toEqual([['measure', '30cm']]);
    // `sdi` is not a unit, so the number stands alone.
    expect(shape('10 sdi')).toEqual([
      ['number', '10'],
      ['ident', 'sdi'],
    ]);
  });

  it('drops comments but keeps the line break that ends the statement', () => {
    expect(shape('a -> b # 映像系統\nc -> d')).toEqual([
      ['ident', 'a'],
      ['arrow', '->'],
      ['ident', 'b'],
      ['newline', '\n'],
      ['ident', 'c'],
      ['arrow', '->'],
      ['ident', 'd'],
    ]);
  });

  it('collapses blank lines into one separator', () => {
    expect(shape('a\n\n\n\nb')).toEqual([
      ['ident', 'a'],
      ['newline', '\n'],
      ['ident', 'b'],
    ]);
  });

  it('accepts Japanese identifiers', () => {
    expect(shape('配信PC.LAN')).toEqual([
      ['ident', '配信PC'],
      ['dot', '.'],
      ['ident', 'LAN'],
    ]);
  });

  it('decodes string escapes', () => {
    expect(shape('"a\\"b"')).toEqual([['string', 'a"b']]);
  });

  it('reports an unterminated string as invalid rather than throwing', () => {
    const tokens = shape('"V-01\nnext');
    expect(tokens[0]?.[0]).toBe('invalid');
  });

  it('tracks line and column', () => {
    const tokens = tokenize('a\n  b');
    const b = tokens.find((t) => t.value === 'b');
    expect(b?.span.start.line).toBe(2);
    expect(b?.span.start.column).toBe(3);
  });

  it('always terminates with a single eof', () => {
    const tokens = tokenize('a -> b');
    expect(tokens.at(-1)?.type).toBe('eof');
    expect(tokens.filter((t) => t.type === 'eof')).toHaveLength(1);
  });
});
