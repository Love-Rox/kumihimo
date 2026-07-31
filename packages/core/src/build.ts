/**
 * Turns a syntax tree into a resolved {@link Diagram}.
 *
 * This is where the language stops being text and starts being a wiring plan: port
 * ranges expand, devices nobody declared come into existence, signal names become signal
 * types, and every link is checked against the compatibility tables.
 *
 * The pass is deliberately two-phase. Declarations are collected first so that a
 * connection may refer to a device declared later in the file — an author sketching a
 * signal path should not have to declare bottom-up.
 */

import type {
  CompatDecl,
  ConnectionStmt,
  Document,
  DeviceDecl,
  ModelDecl,
  PortRef,
  PortSpecItem,
  SignalDecl,
  Statement,
} from './ast.js';
import type { CompatibilityRule, CompatibilityVerdict } from './compatibility.js';
import { checkCompatibility } from './compatibility.js';
import type { Diagnostic, SeverityConfig, SourceSpan } from './diagnostics.js';
import { DiagnosticBag } from './diagnostics.js';
import type { Device, Diagram, FlowDirection, Group, Link, Port } from './model.js';
import { DEVICE_KINDS } from './model.js';
import type { LineStyle, SignalCategory, SignalType } from './signals.js';
import {
  CATEGORY_COLORS,
  CATEGORY_STYLES,
  createSignalRegistry,
  resolveCableColor,
} from './signals.js';

/** What {@link buildModel} returns. */
export interface BuildResult {
  /** The resolved diagram. Always present, even when diagnostics were reported. */
  diagram: Diagram;
  /** Everything the build had to say. */
  diagnostics: readonly Diagnostic[];
}

/** How to build the model. */
export interface BuildOptions {
  /** Per-rule severity overrides layered over the defaults. */
  severities?: SeverityConfig;
}

const VERDICTS: readonly string[] = ['ok', 'lossy', 'incompatible'];
const CATEGORIES: readonly string[] = [
  'video',
  'audio',
  'control',
  'network',
  'power',
  'sync',
  'generic',
];
const LINE_STYLES: readonly string[] = ['solid', 'dashed', 'dotted'];

/**
 * Expand one port specification item into concrete port names.
 *
 * @param item - The specification as written.
 * @param bag - Where to report a range that cannot be expanded.
 * @returns The port names, in order. Empty when the item is invalid.
 */
function expandPortSpec(item: PortSpecItem, bag: DiagnosticBag): string[] {
  if (item.kind === 'name') return [item.value];

  const { from, to } = item;
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    bag.report('invalid-port-spec', '範囲の端は整数である必要があります', item.span);
    return [];
  }
  if (to < from) {
    bag.report('invalid-port-spec', `範囲 ${from}..${to} は始端が終端より大きい`, item.span);
    return [];
  }
  // A typo like `1..1000` would otherwise silently produce a thousand ports.
  if (to - from > 512) {
    bag.report('invalid-port-spec', `範囲 ${from}..${to} が大きすぎます (上限 512)`, item.span);
    return [];
  }

  const names: string[] = [];
  const prefix = item.kind === 'template' ? item.prefix : '';
  for (let n = from; n <= to; n += 1) names.push(`${prefix}${n}`);
  return names;
}

/** Collects declarations and connections, flattening groups as it goes. */
class Collector {
  readonly devices: { decl: DeviceDecl; groupId?: string }[] = [];
  readonly groups: Group[] = [];
  readonly links: ConnectionStmt[] = [];
  readonly models = new Map<string, ModelDecl>();
  readonly signals: SignalDecl[] = [];
  readonly compats: CompatDecl[] = [];
  title?: string;
  direction: FlowDirection = 'LR';
  readonly options: Record<string, string> = {};

  constructor(private readonly bag: DiagnosticBag) {}

  collect(statements: readonly Statement[], groupId?: string): void {
    for (const statement of statements) {
      switch (statement.type) {
        case 'diagram': {
          if (statement.title !== undefined) this.title = statement.title;
          for (const option of statement.options) {
            if (option.key === 'direction') {
              const value = option.value.value.toUpperCase();
              if (value === 'LR' || value === 'TB') {
                this.direction = value;
              } else {
                this.bag.report(
                  'invalid-value',
                  `direction は LR か TB のいずれかです: ${option.value.value}`,
                  option.span,
                );
              }
            } else {
              this.options[option.key] = option.value.value;
            }
          }
          break;
        }
        case 'model':
          // A later declaration wins, which is how a local override of a library model
          // works without having to edit the library.
          this.models.set(statement.id, statement);
          break;
        case 'use':
          // Already resolved by the loader; nothing left to do here.
          break;
        case 'signal':
          this.signals.push(statement);
          break;
        case 'compat':
          this.compats.push(statement);
          break;
        case 'device':
          this.devices.push(
            groupId === undefined ? { decl: statement } : { decl: statement, groupId },
          );
          break;
        case 'group': {
          const group: Group = {
            id: statement.id,
            label: statement.label ?? statement.id,
            deviceIds: [],
            span: statement.span,
          };
          this.groups.push(group);
          this.collect(statement.statements, statement.id);
          break;
        }
        case 'connection':
          this.links.push(statement);
          break;
      }
    }
  }
}

/** Builds the signal registry from `signal` declarations layered over the builtins. */
function buildSignals(decls: readonly SignalDecl[], bag: DiagnosticBag) {
  const custom: Record<string, SignalType> = {};

  for (const decl of decls) {
    let category: SignalCategory = 'generic';
    if (decl.category !== undefined) {
      if (CATEGORIES.includes(decl.category)) {
        category = decl.category as SignalCategory;
      } else {
        bag.report('invalid-value', `未知のカテゴリ: ${decl.category}`, decl.span);
      }
    }

    const signal: SignalType = {
      name: decl.name,
      category,
      label: decl.name.toUpperCase(),
      color: CATEGORY_COLORS[category],
      style: CATEGORY_STYLES[category],
      width: 2,
      bidirectional: false,
      wireless: false,
      connectors: [],
    };

    for (const option of decl.options) {
      const value = option.value.value;
      switch (option.key) {
        case 'color': {
          // Validated, never passed through. This value lands in an SVG `stroke`
          // attribute, so an unchecked string here lets a `.khm` file inject arbitrary
          // markup into every page that renders it.
          const resolved = resolveCableColor(value);
          if (resolved) {
            signal.color = resolved;
          } else {
            bag.report('invalid-value', `色として解釈できません: ${value}`, option.span);
          }
          break;
        }
        case 'label':
          signal.label = value;
          break;
        case 'width': {
          const width = Number(value);
          if (Number.isFinite(width) && width > 0) {
            signal.width = width;
          } else {
            bag.report('invalid-value', `width は正の数値です: ${value}`, option.span);
          }
          break;
        }
        case 'style':
          if (LINE_STYLES.includes(value)) {
            signal.style = value as LineStyle;
          } else {
            bag.report(
              'invalid-value',
              `style は solid / dashed / dotted です: ${value}`,
              option.span,
            );
          }
          break;
        case 'bidirectional':
          signal.bidirectional = value === 'true';
          break;
        case 'wireless':
          signal.wireless = value === 'true';
          break;
        default:
          bag.report('invalid-value', `未知の signal オプション: ${option.key}`, option.span);
      }
    }

    custom[decl.name] = signal;
  }

  return createSignalRegistry(custom);
}

/** Builds compatibility overrides from `compat` declarations. */
function buildCompatRules(decls: readonly CompatDecl[], bag: DiagnosticBag): CompatibilityRule[] {
  const rules: CompatibilityRule[] = [];

  for (const decl of decls) {
    if (!VERDICTS.includes(decl.verdict)) {
      bag.report(
        'invalid-value',
        `判定は ok / lossy / incompatible のいずれかです: ${decl.verdict}`,
        decl.span,
      );
      continue;
    }

    const rule: CompatibilityRule = {
      from: decl.from,
      to: decl.to,
      verdict: decl.verdict as CompatibilityVerdict,
    };
    if (decl.reason !== undefined) rule.reason = decl.reason;

    const symmetric = decl.attrs.find((a) => a.key === 'symmetric');
    if (symmetric) rule.symmetric = symmetric.value.value !== 'false';

    rules.push(rule);
  }

  return rules;
}

/** Mutable device state during the build. */
class DeviceTable {
  readonly order: string[] = [];
  readonly byId = new Map<string, Device>();

  constructor(private readonly bag: DiagnosticBag) {}

  declare(decl: DeviceDecl, groupId: string | undefined): Device {
    const existing = this.byId.get(decl.id);
    if (existing && !existing.implicit) {
      this.bag.report('duplicate-id', `機器 id が重複しています: ${decl.id}`, decl.span);
      return existing;
    }

    const device: Device = existing ?? {
      id: decl.id,
      label: decl.id,
      kind: 'generic',
      ports: [],
      meta: {},
      implicit: false,
    };

    device.implicit = false;
    device.label = decl.label ?? decl.id;
    device.span = decl.span;
    if (groupId !== undefined) device.groupId = groupId;

    if (decl.kind !== undefined) {
      if (DEVICE_KINDS.includes(decl.kind)) {
        device.kind = decl.kind;
      } else {
        this.bag.report('unknown-device-kind', `未知の機器種別: ${decl.kind}`, decl.span);
      }
    }

    if (!existing) {
      this.byId.set(device.id, device);
      this.order.push(device.id);
    }
    return device;
  }

  /** Fetch a device, inventing an implicit one when a connection names an unknown id. */
  resolve(id: string, span: SourceSpan): Device {
    const existing = this.byId.get(id);
    if (existing) return existing;

    this.bag.report('implicit-device', `宣言されていない機器を参照しています: ${id}`, span);
    const device: Device = {
      id,
      label: id,
      kind: 'generic',
      ports: [],
      meta: {},
      implicit: true,
    };
    this.byId.set(id, device);
    this.order.push(id);
    return device;
  }

  addPort(device: Device, port: Port): Port {
    const existing = device.ports.find((p) => p.name === port.name);
    if (existing) return existing;
    device.ports.push(port);
    return port;
  }

  /**
   * Resolve the port a connection end refers to, inventing it when it was never declared.
   *
   * An end that names no port at all gets a fresh numbered port on the appropriate side,
   * which is how `pdu -- rack` twice models two outlets rather than one overbooked one.
   */
  resolvePort(
    device: Device,
    name: string | undefined,
    side: 'from' | 'to',
    span: SourceSpan,
  ): Port {
    if (name === undefined) {
      const prefix = side === 'from' ? 'OUT' : 'IN';
      let n = 1;
      while (device.ports.some((p) => p.name === `${prefix}${n}`)) n += 1;
      const generated = `${prefix}${n}`;
      this.bag.report(
        'implicit-port',
        `ポートが指定されていないため ${device.id}.${generated} を生成しました`,
        span,
      );
      return this.addPort(device, {
        id: `${device.id}.${generated}`,
        name: generated,
        deviceId: device.id,
        direction: side === 'from' ? 'out' : 'in',
        implicit: true,
      });
    }

    const existing = device.ports.find((p) => p.name === name);
    if (existing) return existing;

    this.bag.report(
      'implicit-port',
      `宣言されていないポートを参照しています: ${device.id}.${name}`,
      span,
    );
    return this.addPort(device, {
      id: `${device.id}.${name}`,
      name,
      deviceId: device.id,
      direction: side === 'from' ? 'out' : 'in',
      implicit: true,
    });
  }
}

/** Pair up the two ends of a connection, accounting for the parenthesised multi form. */
function pairEnds(
  from: PortRef,
  to: PortRef,
  span: SourceSpan,
  bag: DiagnosticBag,
): [string | undefined, string | undefined][] {
  const left = from.ports.length > 0 ? from.ports : [undefined];
  const right = to.ports.length > 0 ? to.ports : [undefined];

  if (left.length !== right.length) {
    bag.report(
      'invalid-port-spec',
      `両端のポート数が一致しません (${left.length} 対 ${right.length})`,
      span,
    );
    return [];
  }

  return left.map((name, i) => [name, right[i]]);
}

/**
 * Build a resolved diagram from a parsed document.
 *
 * Never throws. Anything it cannot resolve becomes a diagnostic and a best-effort model,
 * so the renderer always has something to draw.
 *
 * @param document - The syntax tree to resolve.
 * @param options - Severity configuration.
 * @returns The diagram and any diagnostics raised while building it.
 */
export function buildModel(document: Document, options: BuildOptions = {}): BuildResult {
  const bag = new DiagnosticBag(options.severities ?? {});

  const collector = new Collector(bag);
  collector.collect(document.statements);

  const signals = buildSignals(collector.signals, bag);
  const compatRules = buildCompatRules(collector.compats, bag);
  const table = new DeviceTable(bag);

  // ── declarations ────────────────────────────────────────────────────────
  for (const { decl, groupId } of collector.devices) {
    // A device may inherit from a model. The model supplies defaults; anything the
    // device states itself wins, and its ports are added to the model's rather than
    // replacing them, so one unit with an extra card stays easy to describe.
    let base: ModelDecl | undefined;
    if (decl.model !== undefined) {
      base = collector.models.get(decl.model);
      if (!base) {
        bag.report('unknown-model', `未定義のモデルです: ${decl.model}`, decl.span);
      }
    }

    const effective: DeviceDecl = {
      ...decl,
      ports: [...(base?.ports ?? []), ...decl.ports],
      meta: [...(base?.meta ?? []), ...decl.meta],
    };
    if (decl.label === undefined && base?.label !== undefined) effective.label = base.label;
    if (decl.kind === undefined && base?.kind !== undefined) effective.kind = base.kind;

    const device = table.declare(effective, groupId);

    for (const meta of effective.meta) device.meta[meta.key] = meta.value.value;

    for (const portDecl of effective.ports) {
      // Only the first port a declaration expands into begins the new block; `gap` above
      // `in CH[1..16]` means one space before CH1, not sixteen spaces down the strip.
      let gapPending = portDecl.gapBefore;

      for (const item of portDecl.spec) {
        for (const name of expandPortSpec(item, bag)) {
          const port: Port = {
            id: `${device.id}.${name}`,
            name,
            deviceId: device.id,
            direction: portDecl.direction,
            implicit: false,
            span: portDecl.span,
          };
          if (gapPending !== undefined) {
            port.gapBefore = gapPending;
            gapPending = undefined;
          }
          if (portDecl.signal !== undefined) {
            if (signals[portDecl.signal]) {
              port.signal = portDecl.signal;
            } else {
              bag.report('unknown-signal', `未定義の信号種別: ${portDecl.signal}`, portDecl.span);
            }
          }
          table.addPort(device, port);
        }
      }
    }

    if (groupId !== undefined) {
      const group = collector.groups.find((g) => g.id === groupId);
      if (group && !group.deviceIds.includes(device.id)) group.deviceIds.push(device.id);
    }
  }

  // ── connections ─────────────────────────────────────────────────────────
  const links: Link[] = [];
  const seenPairs = new Set<string>();
  const inboundCount = new Map<string, number>();

  for (const stmt of collector.links) {
    const fromDevice = table.resolve(stmt.from.device, stmt.span);
    const toDevice = table.resolve(stmt.to.device, stmt.span);

    for (const [fromName, toName] of pairEnds(stmt.from, stmt.to, stmt.span, bag)) {
      const fromPort = table.resolvePort(fromDevice, fromName, 'from', stmt.span);
      const toPort = table.resolvePort(toDevice, toName, 'to', stmt.span);

      let signalName = stmt.signal;
      if (signalName !== undefined && !signals[signalName]) {
        bag.report('unknown-signal', `未定義の信号種別: ${signalName}`, stmt.span);
        signalName = undefined;
      }

      // Each end is judged by what its own port declares. The signal named on the link
      // describes the cable, and only fills in for an end that declares nothing — if it
      // spoke for both ends it would compare a type against itself and never catch a
      // mismatch, which is precisely the case worth catching.
      const generic = signals['generic']!;
      const fromSignal = signals[fromPort.signal ?? signalName ?? 'generic'] ?? generic;
      const toSignal = signals[toPort.signal ?? signalName ?? 'generic'] ?? generic;

      const compatibility = checkCompatibility(fromSignal, toSignal, {
        overrides: compatRules,
        hasAdapter: stmt.via !== undefined,
      });

      // Direction. Implicit ports have no declared direction, so they never conflict.
      if (stmt.arrow === '->' && !fromPort.implicit && !toPort.implicit) {
        if (fromPort.direction === 'in') {
          bag.report(
            'direction-mismatch',
            `${fromPort.id} は入力ポートなので送出できません`,
            stmt.span,
          );
        }
        if (toPort.direction === 'out') {
          bag.report(
            'direction-mismatch',
            `${toPort.id} は出力ポートなので受けられません`,
            stmt.span,
          );
        }
      }

      // Compatibility.
      if (compatibility.verdict === 'incompatible') {
        const code = stmt.via !== undefined ? 'adapter-insufficient' : 'signal-mismatch';
        bag.report(
          code,
          `${fromPort.id} → ${toPort.id}: ${compatibility.reason ?? '信号種別が一致しません'}`,
          stmt.span,
        );
      } else if (compatibility.verdict === 'lossy') {
        const code = compatibility.adapter !== undefined ? 'adapter-required' : 'signal-mismatch';
        bag.report(
          code,
          `${fromPort.id} → ${toPort.id}: ${compatibility.reason ?? '接続に注意が必要です'}`,
          stmt.span,
        );
      }

      // Duplicates and overbooked inputs.
      const key = `${fromPort.id} ${toPort.id}`;
      if (seenPairs.has(key)) {
        bag.report(
          'duplicate-connection',
          `同じ結線が重複しています: ${key.replace(' ', ' → ')}`,
          stmt.span,
        );
      }
      seenPairs.add(key);

      if (stmt.arrow === '->') {
        const count = (inboundCount.get(toPort.id) ?? 0) + 1;
        inboundCount.set(toPort.id, count);
        if (count > 1) {
          bag.report('port-overbooked', `${toPort.id} に複数の入力が結線されています`, stmt.span);
        }
      }

      const link: Link = {
        id: `${fromPort.id}->${toPort.id}#${links.length}`,
        from: { deviceId: fromDevice.id, portName: fromPort.name },
        to: { deviceId: toDevice.id, portName: toPort.name },
        arrow: stmt.arrow,
        signal:
          (signalName !== undefined ? signals[signalName] : undefined) ??
          (fromSignal.category === 'generic' ? toSignal : fromSignal),
        attrs: Object.fromEntries(stmt.attrs.map((a) => [a.key, a.value.value])),
        compatibility,
        span: stmt.span,
      };
      if (stmt.length !== undefined) link.length = stmt.length;
      if (stmt.label !== undefined) link.label = stmt.label;
      if (stmt.via !== undefined) link.via = stmt.via;

      // A wireless link has nothing to measure and nothing to adapt. Carrying either
      // over from a copy-pasted cable line is a mistake worth naming.
      const wireless = fromSignal.wireless || toSignal.wireless;
      if (wireless) {
        if (stmt.length !== undefined) {
          bag.report(
            'invalid-value',
            `無線区間にケーブル長は指定できません: ${stmt.length}`,
            stmt.span,
          );
          delete link.length;
        }
        if (stmt.via !== undefined) {
          bag.report('invalid-value', '無線区間に変換ケーブルは挟めません', stmt.span);
          delete link.via;
        }
        const radio = stmt.attrs.find((a) => a.key === 'freq' || a.key === 'ch');
        if (radio) {
          link.frequency = radio.key === 'ch' ? `ch ${radio.value.value}` : radio.value.value;
        }
      }

      const written = stmt.attrs.find((a) => a.key === 'color');
      if (written) {
        const color = resolveCableColor(written.value.value);
        if (color) {
          link.color = color;
        } else {
          bag.report(
            'invalid-value',
            `色として解釈できません: ${written.value.value}`,
            written.span,
          );
        }
      }

      links.push(link);
    }
  }

  // ── unconnected ports ───────────────────────────────────────────────────
  const wired = new Set<string>();
  for (const link of links) {
    wired.add(`${link.from.deviceId}.${link.from.portName}`);
    wired.add(`${link.to.deviceId}.${link.to.portName}`);
  }
  for (const id of table.order) {
    const device = table.byId.get(id)!;
    for (const port of device.ports) {
      if (!port.implicit && !wired.has(port.id)) {
        bag.report('unconnected-port', `どこにも結線されていません: ${port.id}`, port.span);
      }
    }
  }

  const diagram: Diagram = {
    direction: collector.direction,
    options: collector.options,
    devices: table.order.map((id) => table.byId.get(id)!),
    groups: collector.groups,
    links,
    signals,
    compatRules,
  };
  if (collector.title !== undefined) diagram.title = collector.title;

  return { diagram, diagnostics: bag.all };
}
