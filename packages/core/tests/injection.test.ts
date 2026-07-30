/**
 * The renderer emits markup that gets inlined into pages. A `.khm` file is therefore
 * untrusted input in any application that compiles diagrams it did not write, and every
 * value that reaches an attribute has to be proven safe.
 */

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';

/**
 * Assert that nothing from the source became markup.
 *
 * Text content is stripped before the attribute check: a label reading
 * `&lt;img onerror=…&gt;` is correctly escaped and must not be flagged, while the same
 * characters sitting in tag position would mean an attribute escaped its quotes.
 */
function assertNoInjection(svg: string): void {
  const tagsOnly = svg.replace(/>[^<]*</g, '><');
  expect(tagsOnly).not.toMatch(/\son\w+\s*=/i);
  expect(svg).not.toContain('<script');
  expect(svg).not.toContain('javascript:');
  // Angle brackets from the source must always come back escaped.
  expect(svg).not.toMatch(/<(?!\/?(?:svg|g|rect|path|text|circle|polyline|marker|defs)[\s/>])/);
}

describe('signal colour', () => {
  it('rejects a value that breaks out of the stroke attribute', async () => {
    const { svg, diagnostics } = await compile(
      'signal evil : video { color: "\\" onload=\\"alert(1)" }\na.X -> b.Y : evil',
    );
    expect(diagnostics.some((d) => d.code === 'invalid-value')).toBe(true);
    assertNoInjection(svg);
  });

  it('rejects a javascript: url', async () => {
    const { svg } = await compile(
      'signal evil : video { color: "javascript:alert(1)" }\na.X -> b.Y : evil',
    );
    assertNoInjection(svg);
  });

  it('rejects a css url() reference', async () => {
    const { svg, diagnostics } = await compile(
      'signal evil : video { color: "url(#x)" }\na.X -> b.Y : evil',
    );
    expect(diagnostics.some((d) => d.code === 'invalid-value')).toBe(true);
    expect(svg).not.toContain('url(#x)');
  });

  it('still accepts a legitimate colour', async () => {
    const { svg, diagnostics } = await compile(
      'signal ok : video { color: "#f59e0b" }\na.X -> b.Y : ok',
    );
    expect(diagnostics.filter((d) => d.code === 'invalid-value')).toEqual([]);
    expect(svg).toContain('#f59e0b');
  });
});

describe('cable colour', () => {
  it('rejects a value that breaks out of the attribute', async () => {
    const { svg } = await compile('a.X -> b.Y : sdi [color="\\" onload=\\"alert(1)"]');
    assertNoInjection(svg);
  });
});

describe('text values', () => {
  it('escapes a device label', async () => {
    const { svg } = await compile('device d "<script>alert(1)</script>" as generic');
    assertNoInjection(svg);
    expect(svg).toContain('&lt;script&gt;');
  });

  it('escapes a diagram title', async () => {
    const { svg } = await compile('diagram "</svg><script>alert(1)</script>"\ndevice d');
    assertNoInjection(svg);
  });

  it('escapes a cable label', async () => {
    const { svg } = await compile('a.X -> b.Y : sdi "<img src=x onerror=alert(1)>"');
    assertNoInjection(svg);
  });

  it('escapes a port name', async () => {
    const { svg } = await compile('device d { out "\\"onload=\\"x" : sdi }');
    assertNoInjection(svg);
  });

  it('escapes a group label', async () => {
    const { svg } = await compile('group g "<script>x</script>" { device d }');
    assertNoInjection(svg);
  });

  it('escapes an adapter name', async () => {
    const { svg } = await compile(`
      device a as computer { out HDMI : hdmi }
      device b as display  { in  DVI  : dvi }
      a.HDMI -> b.DVI via "<script>x</script>"
    `);
    assertNoInjection(svg);
  });
});

describe('caller-supplied options', () => {
  it('escapes a font stack', async () => {
    const { svg } = await compile('device d', { fontFamily: '"><script>alert(1)</script>' });
    assertNoInjection(svg);
  });
});
