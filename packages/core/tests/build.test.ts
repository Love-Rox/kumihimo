import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import type { DiagnosticCode } from '../src/diagnostics.js';
import { parse } from '../src/parser.js';

function build(source: string) {
  const { document, diagnostics: parseDiags } = parse(source);
  expect(parseDiags).toEqual([]);
  return buildModel(document);
}

/** Diagnostic codes raised, for compact assertions. */
function codes(source: string): DiagnosticCode[] {
  return build(source).diagnostics.map((d) => d.code);
}

describe('port expansion', () => {
  it('expands a numeric range', () => {
    const { diagram } = build('device sw { in 1..4 : sdi }');
    expect(diagram.devices[0]?.ports.map((p) => p.name)).toEqual(['1', '2', '3', '4']);
  });

  it('expands a prefixed range', () => {
    const { diagram } = build('device m { in CH[1..16] : xlr }');
    const ports = diagram.devices[0]?.ports ?? [];
    expect(ports).toHaveLength(16);
    expect(ports[0]?.name).toBe('CH1');
    expect(ports[15]?.name).toBe('CH16');
  });

  it('expands a comma list and keeps declaration order', () => {
    const { diagram } = build('device m { out L, R : xlr }');
    expect(diagram.devices[0]?.ports.map((p) => p.name)).toEqual(['L', 'R']);
  });

  it('rejects a reversed range', () => {
    expect(codes('device d { in 4..1 : sdi }')).toContain('invalid-port-spec');
  });

  it('rejects an absurdly large range rather than allocating it', () => {
    const { diagram, diagnostics } = build('device d { in 1..99999 : sdi }');
    expect(diagnostics.map((x) => x.code)).toContain('invalid-port-spec');
    expect(diagram.devices[0]?.ports).toHaveLength(0);
  });
});

describe('implicit devices and ports', () => {
  it('invents a device a connection refers to, and says so', () => {
    const { diagram, diagnostics } = build('cam.SDI -> sw.1 : sdi');
    expect(diagnostics.filter((d) => d.code === 'implicit-device')).toHaveLength(2);
    expect(diagram.devices.map((d) => d.id)).toEqual(['cam', 'sw']);
    expect(diagram.devices.every((d) => d.implicit)).toBe(true);
  });

  it('invents a port on a declared device', () => {
    const { diagnostics } = build(`
      device sw "Switcher" as switcher { in 1..4 : sdi }
      device cam as camera { out SDI : sdi }
      cam.SDI -> sw.99 : sdi
    `);
    expect(diagnostics.map((d) => d.code)).toContain('implicit-port');
  });

  it('gives each unnamed end its own port, modelling separate outlets', () => {
    const { diagram } = build(`
      device pdu as generic
      device r1 as generic
      device r2 as generic
      pdu -- r1 : ac
      pdu -- r2 : ac
    `);
    const pdu = diagram.devices.find((d) => d.id === 'pdu');
    expect(pdu?.ports.map((p) => p.name)).toEqual(['OUT1', 'OUT2']);
  });

  it('does not apply direction rules to invented ports', () => {
    // Neither port is declared, so kumihimo cannot know their direction and must not guess.
    expect(codes('a.X -> b.Y : sdi')).not.toContain('direction-mismatch');
  });
});

describe('forward references', () => {
  it('resolves a connection written before the devices it names', () => {
    const { diagram, diagnostics } = build(`
      cam.SDI -> sw.1 : sdi
      device cam "SONY FX3" as camera { out SDI : sdi }
      device sw  "ATEM"     as switcher { in 1..4 : sdi }
    `);
    expect(diagnostics.filter((d) => d.code === 'implicit-device')).toHaveLength(0);
    expect(diagram.devices.find((d) => d.id === 'cam')?.label).toBe('SONY FX3');
    expect(diagram.links).toHaveLength(1);
  });
});

describe('which way the layout flows', () => {
  const SHOW =
    'device a as camera { out O : sdi }\ndevice b as display { in I : sdi }\na.O -> b.I : sdi';
  const of = (source: string, options = {}) => buildModel(parse(source).document, options).diagram;

  it('reads left to right unless told otherwise', () => {
    expect(of(SHOW).direction).toBe('LR');
  });

  it('takes the caller default when the source says nothing', () => {
    // `-d` had nowhere to arrive and did nothing at all: it was passed as an `options` bag
    // that no build option ever declared, so it type-checked and vanished.
    expect(of(SHOW, { direction: 'TB' }).direction).toBe('TB');
  });

  it('lets the source win over the caller', () => {
    // The rule the theme already follows: the drawing knows how it is meant to read, the
    // caller only knows a default.
    expect(of(`diagram { direction: LR }\n${SHOW}`, { direction: 'TB' }).direction).toBe('LR');
  });

  it('reads the written value in any case', () => {
    expect(of(`diagram { direction: tb }\n${SHOW}`).direction).toBe('TB');
  });

  it('reports a direction it cannot lay out, rather than picking one quietly', () => {
    const { diagram, diagnostics } = buildModel(
      parse(`diagram { direction: RL }\n${SHOW}`).document,
    );
    expect(diagnostics.map((d) => d.code)).toContain('invalid-value');
    expect(diagnostics[0]?.message).toContain('RL');
    // And a drawing still comes out — the default rather than nothing.
    expect(diagram.direction).toBe('LR');
  });

  it('keeps direction off the loose options bag', () => {
    // `options` carries what the build did not understand. Direction is understood, and a
    // copy sitting there too is a second answer waiting to disagree with the first.
    expect(of(`diagram { direction: TB }\n${SHOW}`).options['direction']).toBeUndefined();
  });
});

describe('direction checking', () => {
  const decls = `
    device a as generic { out OUT : sdi  in IN : sdi }
    device b as generic { out OUT : sdi  in IN : sdi }
  `;

  it('accepts out to in', () => {
    expect(codes(`${decls} a.OUT -> b.IN : sdi`)).not.toContain('direction-mismatch');
  });

  it('rejects driving from an input', () => {
    expect(codes(`${decls} a.IN -> b.IN : sdi`)).toContain('direction-mismatch');
  });

  it('rejects feeding an output', () => {
    expect(codes(`${decls} a.OUT -> b.OUT : sdi`)).toContain('direction-mismatch');
  });

  it('leaves undirected links alone', () => {
    expect(codes(`${decls} a.OUT -- b.OUT : ac`)).not.toContain('direction-mismatch');
  });
});

describe('compatibility on real links', () => {
  const decls = `
    device src as generic { out A : sdi   out B : hdmi  out C : xlr  out D : hdbaset out E : dp }
    device dst as generic { in  A : sdi   in  B : hdmi  in  C : rca  in  D : lan     in  F : dvi }
  `;

  it('stays quiet on a matching pair', () => {
    expect(codes(`${decls} src.A -> dst.A : sdi`)).toEqual([]);
  });

  it('flags a connector confusion with its reason', () => {
    const { diagnostics } = build(`${decls} src.D -> dst.D`);
    const hit = diagnostics.find((d) => d.code === 'signal-mismatch');
    expect(hit?.message).toContain('is not Ethernet');
  });

  it('warns that an adapter is needed and names it', () => {
    const { diagnostics } = build(`${decls} src.E -> dst.F`);
    const hit = diagnostics.find((d) => d.code === 'adapter-required');
    expect(hit?.message).toContain('DisplayPort-DVI adapter');
  });

  it('clears once via declares the adapter', () => {
    expect(codes(`${decls} src.E -> dst.F via "DP-DVI 変換"`)).not.toContain('adapter-required');
  });

  it('reports adapter-insufficient when via cannot help', () => {
    expect(codes(`${decls} src.D -> dst.D via "なんとか変換"`)).toContain('adapter-insufficient');
  });

  it('warns on balanced to unbalanced', () => {
    expect(codes(`${decls} src.C -> dst.C`)).toContain('signal-mismatch');
  });

  it('is not masked by naming a signal on the link', () => {
    // The link's signal describes the cable. If it also spoke for both ends, every
    // check would compare a type against itself and no mismatch could ever surface.
    expect(codes(`${decls} src.D -> dst.D : hdbaset`)).toContain('signal-mismatch');
    expect(codes(`${decls} src.C -> dst.C : xlr`)).toContain('signal-mismatch');
  });

  it('still lets the link supply a type for ends that declare none', () => {
    expect(codes('a.X -> b.Y : sdi')).not.toContain('signal-mismatch');
  });

  it('honours a compat override, silencing the builtin verdict', () => {
    expect(
      codes(`compat hdbaset -> lan : ok "専用線として敷設済み"\n${decls} src.D -> dst.D`),
    ).toEqual([]);
  });
});

describe('signal resolution', () => {
  it('infers the signal from the ports when the link omits it', () => {
    const { diagram } = build(`
      device a { out X : sdi }
      device b { in  Y : sdi }
      a.X -> b.Y
    `);
    expect(diagram.links[0]?.signal.name).toBe('sdi');
  });

  it('treats an undescribed link as generic rather than a mismatch', () => {
    expect(codes('a.X -> b.Y')).not.toContain('signal-mismatch');
  });

  it('reports an unknown signal name', () => {
    expect(codes('a.X -> b.Y : notasignal')).toContain('unknown-signal');
  });

  it('applies a user signal declaration', () => {
    const { diagram } = build(`
      signal madi64 : audio { color: "#f59e0b" width: 3 }
      a.X -> b.Y : madi64
    `);
    expect(diagram.links[0]?.signal.color).toBe('#f59e0b');
    expect(diagram.links[0]?.signal.width).toBe(3);
  });

  it('lets a signal declaration override a builtin', () => {
    const { diagram } = build(`
      signal sdi : video { color: "#000000" }
      a.X -> b.Y : sdi
    `);
    expect(diagram.links[0]?.signal.color).toBe('#000000');
  });
});

describe('duplicates and overbooking', () => {
  const decls = `
    device a { out X : sdi }
    device b { in  Y : sdi }
    device c { out X : sdi }
  `;

  it('flags the same cable written twice', () => {
    expect(codes(`${decls} a.X -> b.Y : sdi\na.X -> b.Y : sdi`)).toContain('duplicate-connection');
  });

  it('flags two sources feeding one input', () => {
    expect(codes(`${decls} a.X -> b.Y : sdi\nc.X -> b.Y : sdi`)).toContain('port-overbooked');
  });

  it('flags a duplicated device id', () => {
    expect(codes('device a as camera\ndevice a as mixer')).toContain('duplicate-id');
  });
});

describe('multi-port connections', () => {
  it('expands a parenthesised pair into two links', () => {
    const { diagram } = build(`
      device mixer { out L, R : xlr }
      device amp   { in IN_L, IN_R : xlr }
      mixer.(L, R) -> amp.(IN_L, IN_R) : xlr
    `);
    expect(diagram.links).toHaveLength(2);
    expect(diagram.links[0]?.from.portName).toBe('L');
    expect(diagram.links[1]?.to.portName).toBe('IN_R');
  });

  it('rejects mismatched counts', () => {
    expect(codes('a.(L, R) -> b.(X) : xlr')).toContain('invalid-port-spec');
  });
});

describe('groups and metadata', () => {
  it('records group membership', () => {
    const { diagram } = build(`
      group rack "メインラック" {
        device sw as switcher { in 1..2 : sdi }
        device m  as mixer    { in 1..2 : xlr }
      }
    `);
    expect(diagram.groups[0]?.label).toBe('メインラック');
    expect(diagram.groups[0]?.deviceIds).toEqual(['sw', 'm']);
    expect(diagram.devices[0]?.groupId).toBe('rack');
  });

  it('collects device metadata', () => {
    const { diagram } = build('device r as recorder { in SDI : sdi\n@model "HyperDeck" }');
    expect(diagram.devices[0]?.meta).toEqual({ model: 'HyperDeck' });
  });

  it('warns on an unknown device kind but still builds', () => {
    const { diagram, diagnostics } = build('device x as teleporter');
    expect(diagnostics.map((d) => d.code)).toContain('unknown-device-kind');
    expect(diagram.devices[0]?.kind).toBe('generic');
  });
});

describe('diagram options', () => {
  it('reads the title and direction', () => {
    const { diagram } = build('diagram "配信スタジオ" { direction: TB }');
    expect(diagram.title).toBe('配信スタジオ');
    expect(diagram.direction).toBe('TB');
  });

  it('defaults to left-to-right', () => {
    expect(build('device a').diagram.direction).toBe('LR');
  });

  it('rejects an unknown direction', () => {
    expect(codes('diagram { direction: sideways }')).toContain('invalid-value');
  });
});

describe('unconnected ports', () => {
  it('stays silent by default', () => {
    expect(codes('device a { out X : sdi }')).toEqual([]);
  });

  it('reports them when the rule is turned on', () => {
    const { document } = parse(
      'device a { out X : sdi\nout Y : sdi }\ndevice b { in Z : sdi }\na.X -> b.Z : sdi',
    );
    const { diagnostics } = buildModel(document, {
      severities: { 'unconnected-port': 'warning' },
    });
    expect(diagnostics.map((d) => d.message)).toEqual(['Wired to nothing: a.Y']);
  });
});

describe('wireless endpoints', () => {
  it('accepts the kinds the wireless diagnostic tells you to declare', () => {
    // The message says "put the transmitter or receiver in as a device". Until these
    // existed, following that advice produced `unknown-device-kind`.
    const source = [
      'device tx "送信機" as transmitter { in IN : xlr  out RF : uhf }',
      'device rx "受信機" as receiver    { in RF : uhf  out OUT : xlr }',
      'tx.RF -> rx.RF : uhf',
    ].join('\n');
    expect(codes(source)).toEqual([]);
  });

  it('draws a radio path through them without complaint', () => {
    const source = [
      'device mic "ワイヤレスマイク" as microphone { out OUT : xlr }',
      'device tx  as transmitter { in IN : xlr  out RF : uhf }',
      'device rx  as receiver    { in RF : uhf  out OUT : xlr }',
      'device desk as mixer      { in CH1 : xlr }',
      'mic.OUT -> tx.IN  : xlr 1m',
      'tx.RF   -> rx.RF  : uhf [ch=38]',
      'rx.OUT  -> desk.CH1 : xlr 3m',
    ].join('\n');
    expect(codes(source)).toEqual([]);
  });
});
