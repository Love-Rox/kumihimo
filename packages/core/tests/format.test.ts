/**
 * The formatter.
 *
 * The only property that really matters is that laying a file out does not change what it
 * says. Everything else is taste; that one is a bug that would silently rewire a drawing,
 * and it is the reason these tests compare compiled models rather than strings.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { formatSource } from '../src/format.js';
import { parse } from '../src/parser.js';

const MESSY = `# 配信スタジオ
diagram "配信スタジオ 系統図"{direction:LR}

group stage "ステージ"{
device cam1 "SONY FX3" as camera{out SDI:sdi}
   device mic1 "SM58" as microphone {out OUT:xlr}
}

device sw "ATEM Mini Extreme" as switcher {
in 1..8:sdi
in AUDIO_L,AUDIO_R:trs
out PGM:sdi   # 本線
out STREAM:lan
}

adapter split "TRRS 分岐"{io HS:trrs35
out HP:trs35}

cam1.SDI->sw.1:sdi 30m "V-01" [color=青]
mic1.OUT->sw.AUDIO_L:xlr 20m "A-01"
`;

/** A drawing reduced to what it says, so two spellings of it can be compared. */
function meaning(source: string) {
  const { diagram, diagnostics } = buildModel(parse(source).document);
  return {
    diagnostics: diagnostics.map((d) => `${d.code}:${d.message}`),
    devices: diagram.devices.map((d) => ({
      id: d.id,
      label: d.label,
      kind: d.kind,
      passive: d.passive,
      group: d.groupId,
      ports: d.ports.map((p) => `${p.direction} ${p.name}:${p.signal ?? ''}`),
    })),
    links: diagram.links.map((l) => ({
      from: `${l.from.deviceId}.${l.from.portName}`,
      to: `${l.to.deviceId}.${l.to.portName}`,
      signal: l.signal.name,
      length: l.length,
      label: l.label,
      color: l.color,
    })),
    title: diagram.title,
    direction: diagram.direction,
  };
}

describe('what it must never do', () => {
  it('does not change what the file says', () => {
    expect(meaning(formatSource(MESSY))).toEqual(meaning(MESSY));
  });

  it('does not change what an already-tidy file says either', () => {
    const tidy = formatSource(MESSY);
    expect(meaning(formatSource(tidy))).toEqual(meaning(tidy));
  });

  it('settles after one pass', () => {
    const once = formatSource(MESSY);
    expect(formatSource(once)).toBe(once);
  });

  it('keeps every comment', () => {
    const source = [
      '# top',
      'device a as mixer {  # trailing',
      '  in X : xlr  # on a port',
      '}',
    ].join('\n');
    const out = formatSource(source);
    expect(out).toContain('# top');
    expect(out).toContain('# trailing');
    expect(out).toContain('# on a port');
  });

  it('leaves a `#` inside a string alone', () => {
    // A cable number can contain one, and treating it as a comment would delete the rest
    // of the line — including the closing quote.
    const source = 'a.OUT -> b.IN : sdi "V-01 #2"';
    expect(formatSource(source).trim()).toBe('a.OUT -> b.IN : sdi "V-01 #2"');
  });

  it('gives a half-typed file back rather than an error', () => {
    // Someone formats mid-keystroke. An empty buffer would be the worst possible answer.
    const source = 'device a as mixer {\n  in X :';
    expect(() => formatSource(source)).not.toThrow();
    expect(formatSource(source)).toContain('device a as mixer');
  });
});

describe('what it does', () => {
  const out = formatSource(MESSY);
  const lines = out.split('\n');

  it('indents by nesting', () => {
    expect(lines).toContain('  in  1..8             : sdi');
    expect(lines).toContain('  device mic1 "SM58" as microphone { out OUT: xlr }');
  });

  it('aligns a run of port declarations to each other', () => {
    // Scoped to one block on purpose. Two blocks are two runs, and padding one to the
    // other would make an edit in the switcher widen the splitter.
    const start = lines.findIndex((l) => l.startsWith('device sw '));
    const block = lines.slice(start + 1, lines.indexOf('}', start));
    const colons = block.map((l) => l.indexOf(':'));
    expect(colons.length).toBe(4);
    expect(new Set(colons).size).toBe(1);
  });

  it('keeps the columns of one block to itself', () => {
    const source = [
      'device wide as mixer {',
      '  in VERY_LONG_NAME : xlr',
      '}',
      'adapter narrow {',
      '  in A : xlr',
      '}',
    ].join('\n');
    expect(formatSource(source)).toContain('  in A : xlr');
  });

  it('aligns a run of connections to each other', () => {
    const links = lines.filter((l) => l.includes('->'));
    expect(new Set(links.map((l) => l.indexOf('->'))).size).toBe(1);
    expect(new Set(links.map((l) => l.indexOf(':'))).size).toBe(1);
  });

  it('does not align across a blank line or a change of shape', () => {
    // A reader stops scanning a column at a gap, so padding across one buys nothing and
    // makes an unrelated edit widen a block it has nothing to do with.
    const source = ['a.X -> b.Y : sdi', '', 'longer.OUT -> other.IN : sdi'].join('\n');
    const [first, , second] = formatSource(source).split('\n');
    expect(first).toBe('a.X -> b.Y : sdi');
    expect(second).toBe('longer.OUT -> other.IN : sdi');
  });

  it('collapses runs of blank lines to one, and trims the ends', () => {
    const source =
      '\n\ndevice a as mixer { in X : xlr }\n\n\n\ndevice b as mixer { in Y : xlr }\n\n\n';
    expect(formatSource(source)).toBe(
      'device a as mixer { in X: xlr }\n\ndevice b as mixer { in Y: xlr }\n',
    );
  });

  it('can be told not to align', () => {
    const source = ['in A : xlr', 'in LONGER : xlr'].join('\n');
    expect(formatSource(source, { align: false })).toBe('in A : xlr\nin LONGER : xlr\n');
  });

  it('honours the indent width', () => {
    const source = 'device a as mixer {\nin X : xlr\n}';
    expect(formatSource(source, { indent: 4 })).toContain('    in X : xlr');
  });
});

describe('blocks that span lines', () => {
  it('gives the braces their own lines', () => {
    // A block opened mid-line and closed on another came out half-tidied, because the
    // formatter never split a line:
    //   adapter hd "HDMI-DVI cable" { in IN: hdmi
    //     out OUT : dvi }
    const source = ['adapter hd "HDMI-DVI cable"{in IN:hdmi', 'out OUT:dvi}'].join('\n');
    expect(formatSource(source)).toBe(
      ['adapter hd "HDMI-DVI cable" {', '  in  IN  : hdmi', '  out OUT : dvi', '}', ''].join('\n'),
    );
  });

  it('leaves a block that fits on one line exactly where it was', () => {
    // The reflow is the smallest one that fixes the defect. Splitting every block would
    // be a different formatter, and a worse one for a file full of one-port devices.
    expect(formatSource('device a as mixer { in X : xlr }')).toBe(
      'device a as mixer { in X: xlr }\n',
    );
  });

  it('handles a block inside a block', () => {
    const source = [
      'group g "G"{device a as mixer{in X:xlr',
      'in Y:xlr}',
      'device b as mixer { in Z : xlr }}',
    ].join('\n');
    expect(formatSource(source)).toBe(
      [
        'group g "G" {',
        '  device a as mixer {',
        '    in X : xlr',
        '    in Y : xlr',
        '  }',
        '  device b as mixer { in Z: xlr }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('keeps a trailing comment on the last piece of the line it was written on', () => {
    // There is no better answer: it was written at the end, so the end is where it stays.
    const source = ['device a as mixer{in X:xlr  # ここ', 'out Y:xlr}  # 末尾'].join('\n');
    const out = formatSource(source);
    expect(out).toContain('in  X : xlr  # ここ');
    expect(out).toContain('}  # 末尾');
  });

  it('leaves an unmatched brace alone rather than guessing', () => {
    // Someone formatting mid-keystroke. Inventing a partner would move their text.
    const source = 'device a as mixer {\n  in X :';
    expect(() => formatSource(source)).not.toThrow();
    expect(formatSource(source)).toContain('device a as mixer {');
  });

  it('still says the same thing after reflowing', () => {
    const source = [
      'group g "G"{device a as mixer{in X:xlr',
      'in Y:xlr}',
      'device b as mixer { in Z : xlr }}',
      'a.X -> b.Z : xlr',
    ].join('\n');
    expect(meaning(formatSource(source))).toEqual(meaning(source));
  });
});
