import { describe, expect, it } from 'vitest';

import type { ConnectionStmt, DeviceDecl, DiagramDecl, GroupDecl } from '../src/ast.js';
import { parse } from '../src/parser.js';

/** Parse and assert nothing went wrong, returning the statements. */
function clean(source: string) {
  const { document, diagnostics } = parse(source);
  expect(diagnostics).toEqual([]);
  return document.statements;
}

describe('diagram declaration', () => {
  it('reads the title and options', () => {
    const [stmt] = clean('diagram "配信スタジオ" {\n  direction: LR\n  spacing: 60\n}');
    const diagram = stmt as DiagramDecl;
    expect(diagram.type).toBe('diagram');
    expect(diagram.title).toBe('配信スタジオ');
    expect(diagram.options.map((o) => [o.key, o.value.value])).toEqual([
      ['direction', 'LR'],
      ['spacing', '60'],
    ]);
  });

  it('allows the title and block to be omitted', () => {
    const [stmt] = clean('diagram');
    expect((stmt as DiagramDecl).title).toBeUndefined();
  });
});

describe('device declaration', () => {
  it('reads id, label, kind, ports and metadata', () => {
    const [stmt] = clean(`
      device sw "ATEM Mini Pro" as switcher {
        in  1..4     : hdmi
        out PGM      : hdmi
        io  CTRL     : lan
        @model "ATEM Mini Pro ISO"
      }
    `);
    const device = stmt as DeviceDecl;
    expect(device.id).toBe('sw');
    expect(device.label).toBe('ATEM Mini Pro');
    expect(device.kind).toBe('switcher');
    expect(device.ports).toHaveLength(3);
    expect(device.meta.map((m) => [m.key, m.value.value])).toEqual([
      ['model', 'ATEM Mini Pro ISO'],
    ]);
  });

  it('parses the four port specification forms', () => {
    const [stmt] = clean(`
      device d {
        in  SDI       : sdi
        out L, R      : xlr
        in  1..4      : hdmi
        in  CH[1..16] : xlr
      }
    `);
    const ports = (stmt as DeviceDecl).ports;
    expect(ports[0]?.spec).toEqual([expect.objectContaining({ kind: 'name', value: 'SDI' })]);
    expect(ports[1]?.spec).toEqual([
      expect.objectContaining({ kind: 'name', value: 'L' }),
      expect.objectContaining({ kind: 'name', value: 'R' }),
    ]);
    expect(ports[2]?.spec).toEqual([expect.objectContaining({ kind: 'range', from: 1, to: 4 })]);
    expect(ports[3]?.spec).toEqual([
      expect.objectContaining({ kind: 'template', prefix: 'CH', from: 1, to: 16 }),
    ]);
  });

  it('accepts a device with no body', () => {
    const [stmt] = clean('device mic1 "SM58" as microphone');
    expect((stmt as DeviceDecl).ports).toEqual([]);
  });
});

describe('connections', () => {
  it('reads ports, arrow, signal and every modifier', () => {
    const [stmt] = clean('cam1.SDI -> sw.1 : sdi 10m "V-01" [connector=BNC]');
    const link = stmt as ConnectionStmt;
    expect(link.from).toMatchObject({ device: 'cam1', ports: ['SDI'] });
    expect(link.to).toMatchObject({ device: 'sw', ports: ['1'] });
    expect(link.arrow).toBe('->');
    expect(link.signal).toBe('sdi');
    expect(link.length).toBe('10m');
    expect(link.label).toBe('V-01');
    expect(link.attrs.map((a) => [a.key, a.value.value])).toEqual([['connector', 'BNC']]);
  });

  it('accepts modifiers in any order', () => {
    const [stmt] = clean('a.X -> b.Y : sdi "V-01" 10m');
    const link = stmt as ConnectionStmt;
    expect(link.length).toBe('10m');
    expect(link.label).toBe('V-01');
  });

  it('reads the via modifier', () => {
    const [stmt] = clean('pc.HDMI -> mon.DVI : hdmi via "HDMI-DVI 変換ケーブル"');
    expect((stmt as ConnectionStmt).via).toBe('HDMI-DVI 変換ケーブル');
  });

  it('reads all three arrows', () => {
    expect((clean('a.X <-> b.Y')[0] as ConnectionStmt).arrow).toBe('<->');
    expect((clean('a.X -- b.Y')[0] as ConnectionStmt).arrow).toBe('--');
  });

  it('reads the parenthesised multi-port form', () => {
    const [stmt] = clean('mixer.(L, R) -> amp.(IN_L, IN_R) : trs');
    const link = stmt as ConnectionStmt;
    expect(link.from.ports).toEqual(['L', 'R']);
    expect(link.to.ports).toEqual(['IN_L', 'IN_R']);
  });

  it('allows a device with no port named', () => {
    const [stmt] = clean('pdu -- rack : ac');
    expect((stmt as ConnectionStmt).from.ports).toEqual([]);
  });
});

describe('groups', () => {
  it('nests statements', () => {
    const [stmt] = clean(`
      group stage "ステージ" {
        device cam1 "SONY FX3" as camera { out SDI : sdi }
        cam1.SDI -> sw.1 : sdi
      }
    `);
    const group = stmt as GroupDecl;
    expect(group.id).toBe('stage');
    expect(group.label).toBe('ステージ');
    expect(group.statements.map((s) => s.type)).toEqual(['device', 'connection']);
  });
});

describe('compat declaration', () => {
  it('reads the verdict, reason and attributes', () => {
    const [stmt] = clean('compat aes -> xlr : ok "社内標準: 10m 以下は許容" [symmetric=false]');
    expect(stmt).toMatchObject({
      type: 'compat',
      from: 'aes',
      to: 'xlr',
      verdict: 'ok',
      reason: '社内標準: 10m 以下は許容',
    });
  });
});

describe('signal declaration', () => {
  it('reads the category and options', () => {
    const [stmt] = clean('signal madi64 : audio {\n  color: "#f59e0b"\n  width: 2\n}');
    expect(stmt).toMatchObject({ type: 'signal', name: 'madi64', category: 'audio' });
  });
});

describe('separators and comments', () => {
  it('accepts semicolons as statement separators', () => {
    expect(clean('a.X -> b.Y; c.X -> d.Y')).toHaveLength(2);
  });

  it('ignores comments and blank lines', () => {
    const statements = clean(`
      # 映像系統
      a.X -> b.Y : sdi   # カメラ1

      # 音響系統
      c.X -> d.Y : xlr
    `);
    expect(statements).toHaveLength(2);
  });
});

describe('error recovery', () => {
  it('reports a bad statement and keeps the rest of the file', () => {
    const { document, diagnostics } = parse(`
      a.X -> b.Y : sdi
      this is not valid
      c.X -> d.Y : xlr
    `);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.code).toBe('parse-error');
    expect(document.statements).toHaveLength(2);
  });

  it('reports an unterminated string without losing later statements', () => {
    const { document, diagnostics } = parse('a.X -> b.Y : sdi "V-01\nc.X -> d.Y : xlr');
    expect(diagnostics.some((d) => d.code === 'parse-error')).toBe(true);
    expect(document.statements.length).toBeGreaterThan(0);
  });

  it('recovers inside a device body without dropping the device', () => {
    const { document, diagnostics } = parse(`
      device sw {
        in 1..4 : hdmi
        !!! garbage
        out PGM : sdi
      }
    `);
    expect(diagnostics.length).toBeGreaterThan(0);
    const device = document.statements[0] as DeviceDecl;
    expect(device.type).toBe('device');
    expect(device.ports).toHaveLength(2);
  });

  it('carries a span on every diagnostic', () => {
    const { diagnostics } = parse('device');
    expect(diagnostics[0]?.span?.start.line).toBe(1);
  });
});

describe('a statement it cannot read', () => {
  // Every one of these hung. `#recover` stops in front of a `}` because a closing brace
  // belongs to the block it closes — right inside one, wrong at the top level, where there
  // is no block and nobody to consume it. The position never moved and the loop went round
  // for ever.
  //
  // Parsing is documented never to throw. Hanging is worse: a caller cannot catch it, and
  // in an editor it takes the diagnostics and the preview with it, because both go through
  // here. That is what "it stops redrawing after a while" looks like from the outside.
  const HUNG = [
    'rack R1 42U { 40U: sw 3U }',
    'x { 40U: sw }',
    'foo bar { baz }',
    'rack R1 42U { }',
    '{ }',
    '}',
    'device a { in 1 : sdi }\n} stray',
  ];

  for (const source of HUNG) {
    it(`returns for ${JSON.stringify(source)}`, () => {
      const started = Date.now();
      const { diagnostics } = parse(source, { locale: 'en' });
      expect(Date.now() - started, 'took too long, which means it looped').toBeLessThan(1000);
      expect(
        diagnostics.length,
        'said nothing about a statement it could not read',
      ).toBeGreaterThan(0);
    });
  }

  it('still reads the statements around one it cannot', () => {
    // Recovery is worth having only if what follows still parses.
    const { document, diagnostics } = parse(
      [
        'device cam "Camera" as camera { out SDI : sdi }',
        'rack R1 42U { }',
        'device rec as recorder { in SDI : sdi }',
      ].join('\n'),
      { locale: 'en' },
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(document.statements.filter((s) => s.type === 'device')).toHaveLength(2);
  });

  it('leaves valid nesting alone', () => {
    const source = 'group g "G" { device a "A" as camera { out O : sdi } }';
    expect(parse(source, { locale: 'en' }).diagnostics).toEqual([]);
  });
});
