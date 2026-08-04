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
import type { Locale, Localised, MessageKey } from './messages.js';
import { DEFAULT_LOCALE, formatMessage, localise } from './messages.js';
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
  /**
   * Language for the diagnostics this build produces. Defaults to English.
   *
   * Each diagnostic also carries the key and the values it was built from, so a caller that
   * wants another language later does not have to build the diagram again.
   */
  locale?: Locale;
  /**
   * Which way the layout flows when the source does not say.
   *
   * A `diagram { direction: … }` in the source wins, the same way it does for the theme:
   * the drawing knows how it is meant to read, the caller only knows a default. Without
   * this the CLI's `-d` had nowhere to arrive and quietly did nothing.
   */
  direction?: FlowDirection;
}

/**
 * The reason a verdict gives, or the stock sentence for verdicts that give none.
 *
 * A rule that explains itself is quoted; one that does not still has to say something, and
 * a bare "types differ" is the least the author can be told.
 *
 * @param result - The verdict being reported.
 * @param fallback - Catalogue key to use when the verdict carries no reason.
 * @param locale - Language to render in.
 * @returns The sentence to put in the diagnostic.
 */
function reasonOf(result: { reason?: Localised }, fallback: MessageKey, locale: Locale): string {
  return result.reason === undefined
    ? formatMessage(fallback, {}, locale)
    : localise(result.reason, locale);
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
    bag.report('invalid-port-spec', 'range.integer', {}, item.span);
    return [];
  }
  if (to < from) {
    bag.report('invalid-port-spec', 'range.order', { from, to }, item.span);
    return [];
  }
  // A typo like `1..1000` would otherwise silently produce a thousand ports.
  if (to - from > 512) {
    bag.report('invalid-port-spec', 'range.too-large', { from, to, limit: 512 }, item.span);
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
  /** Ids declared with `adapter`, so the built device can be marked as a part. */
  readonly adapters = new Set<string>();
  /** Adapters written `as cable`, with the number and length they carry. */
  readonly cables = new Map<string, { length?: string; label?: string }>();
  readonly groups: Group[] = [];
  readonly links: ConnectionStmt[] = [];
  readonly models = new Map<string, ModelDecl>();
  readonly signals: SignalDecl[] = [];
  readonly compats: CompatDecl[] = [];
  title?: string;
  direction: FlowDirection = 'LR';
  ordered = false;
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
                  'value.direction',
                  { value: option.value.value },
                  option.span,
                );
              }
            } else if (option.key === 'order') {
              // `fixed` — place devices in the order they were written. Kept off the loose
              // options bag once understood, so there is one answer rather than two.
              if (option.value.value.toLowerCase() === 'fixed') {
                this.ordered = true;
              } else {
                this.bag.report(
                  'invalid-value',
                  'value.order',
                  { value: option.value.value },
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
        case 'adapter': {
          // Carried as a device from here on: it has ports, links reach it, and it takes
          // part in the layout. Everything that differs is downstream of the model.
          this.adapters.add(statement.id);
          const decl: DeviceDecl = {
            type: 'device',
            id: statement.id,
            ports: statement.ports,
            meta: statement.meta,
            span: statement.span,
          };
          if (statement.label !== undefined) decl.label = statement.label;
          if (statement.asCable) {
            this.cables.set(statement.id, {
              ...(statement.length === undefined ? {} : { length: statement.length }),
              ...(statement.cableLabel === undefined ? {} : { label: statement.cableLabel }),
            });
          }
          this.devices.push(groupId === undefined ? { decl } : { decl, groupId });
          break;
        }
        case 'group': {
          const group: Group = {
            id: statement.id,
            label: statement.label ?? statement.id,
            deviceIds: [],
            span: statement.span,
          };
          // `groupId` here is whatever group *this* declaration sits inside, which for a
          // nested one is its parent. Without it the tree came out flat, and a group whose
          // devices were all in a child group came out empty — and, having nothing to size
          // itself from, was drawn at NaN by NaN.
          if (groupId !== undefined) group.parent = groupId;
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
        bag.report('invalid-value', 'value.category', { value: decl.category }, decl.span);
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
            bag.report('invalid-value', 'value.colour', { value }, option.span);
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
            bag.report('invalid-value', 'value.width', { value }, option.span);
          }
          break;
        }
        case 'style':
          if (LINE_STYLES.includes(value)) {
            signal.style = value as LineStyle;
          } else {
            bag.report('invalid-value', 'value.style', { value }, option.span);
          }
          break;
        case 'bidirectional':
          signal.bidirectional = value === 'true';
          break;
        case 'wireless':
          signal.wireless = value === 'true';
          break;
        default:
          bag.report('invalid-value', 'value.signal-option', { key: option.key }, option.span);
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
      bag.report('invalid-value', 'value.verdict', { value: decl.verdict }, decl.span);
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

/**
 * Which of a connector's accepted types this particular cable is using.
 *
 * A combo jack takes XLR or a 1/4" plug, and the cable is the thing that says which. So
 * when the link names a type the connector accepts, that is the one judged; the alternative
 * is not in play for this run. Without a named type the first declared wins, which is also
 * what the port is drawn as.
 *
 * @param port - The end being resolved.
 * @param linkSignal - Signal named on the connection, if the author named one.
 * @returns Name of the signal type to judge this end by.
 */
function resolveEnd(port: Port, linkSignal: string | undefined): string {
  if (linkSignal !== undefined && port.accepts?.includes(linkSignal)) return linkSignal;
  return port.signal ?? linkSignal ?? 'generic';
}

/** Mutable device state during the build. */
class DeviceTable {
  readonly order: string[] = [];
  readonly byId = new Map<string, Device>();

  constructor(private readonly bag: DiagnosticBag) {}

  declare(decl: DeviceDecl, groupId: string | undefined, passive = false): Device {
    const existing = this.byId.get(decl.id);
    if (existing && !existing.implicit) {
      this.bag.report('duplicate-id', 'device.duplicate-id', { id: decl.id }, decl.span);
      return existing;
    }

    const device: Device = existing ?? {
      id: decl.id,
      label: decl.id,
      kind: 'generic',
      ports: [],
      meta: {},
      implicit: false,
      passive: false,
    };

    device.implicit = false;
    device.passive = passive;
    device.label = decl.label ?? decl.id;
    device.span = decl.span;
    if (groupId !== undefined) device.groupId = groupId;

    if (decl.kind !== undefined) {
      if (DEVICE_KINDS.includes(decl.kind)) {
        device.kind = decl.kind;
      } else {
        this.bag.report(
          'unknown-device-kind',
          'device.unknown-kind',
          { kind: decl.kind },
          decl.span,
        );
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

    this.bag.report('implicit-device', 'device.implicit', { id }, span);
    const device: Device = {
      id,
      label: id,
      kind: 'generic',
      ports: [],
      meta: {},
      implicit: true,
      passive: false,
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
      this.bag.report('implicit-port', 'port.generated', { id: `${device.id}.${generated}` }, span);
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

    this.bag.report('implicit-port', 'port.implicit', { id: `${device.id}.${name}` }, span);
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
      'ports.count-mismatch',
      { left: left.length, right: right.length },
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
  const locale = options.locale ?? DEFAULT_LOCALE;
  const bag = new DiagnosticBag(options.severities ?? {}, locale);

  const collector = new Collector(bag);
  // The caller's default, in place before the source is read, so a `direction` written in
  // the file simply overwrites it and wins without needing a rule of its own.
  if (options.direction !== undefined) collector.direction = options.direction;
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
        bag.report('unknown-model', 'device.unknown-model', { name: decl.model }, decl.span);
      }
    }

    const effective: DeviceDecl = {
      ...decl,
      ports: [...(base?.ports ?? []), ...decl.ports],
      meta: [...(base?.meta ?? []), ...decl.meta],
    };
    if (decl.label === undefined && base?.label !== undefined) effective.label = base.label;
    if (decl.kind === undefined && base?.kind !== undefined) effective.kind = base.kind;

    const device = table.declare(effective, groupId, collector.adapters.has(decl.id));

    const asCable = collector.cables.get(decl.id);
    if (asCable !== undefined) device.cable = asCable;

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
          // Every name is checked, so `xlr | tsr` reports the typo rather than quietly
          // accepting the half of the declaration that happened to be spelled right.
          const accepted = (portDecl.signals ?? []).filter((declared) => {
            if (signals[declared]) return true;
            bag.report('unknown-signal', 'signal.unknown', { name: declared }, portDecl.span);
            return false;
          });

          if (accepted[0] !== undefined) port.signal = accepted[0];
          if (accepted.length > 1) port.accepts = accepted;

          // A run's `[…]` list is kept on the model as free-form extra data, so an unknown
          // key there survives for whoever wants it. A port's is not: `connector` is the
          // only one read, and anything else goes nowhere at all. Saying so is the
          // difference between a typo that does nothing and a typo that does nothing
          // quietly.
          for (const attr of portDecl.attrs ?? []) {
            if (attr.key === 'connector') continue;
            bag.report('invalid-value', 'port.attr-unknown', { name: attr.key }, attr.span);
          }

          // `[connector=XLR-M]` — which of the type's connectors this box actually has.
          // Checked against the type, because a name the type does not list is either a
          // typo or a claim the schedules cannot act on, and both are worth saying.
          const declared = portDecl.attrs?.find((attr) => attr.key === 'connector');
          if (declared !== undefined) {
            const type = port.signal === undefined ? undefined : signals[port.signal];
            const value = String(declared.value.value);
            if (type === undefined) {
              bag.report('invalid-value', 'port.connector-needs-signal', {}, declared.span);
            } else if (!type.connectors.includes(value)) {
              bag.report(
                'invalid-value',
                'port.connector-unknown',
                { name: value, signal: type.name, expected: type.connectors.join(' / ') },
                declared.span,
              );
            } else {
              port.connector = value;
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
        bag.report('unknown-signal', 'signal.unknown', { name: signalName }, stmt.span);
        signalName = undefined;
      }

      let carrierName = stmt.carrier;
      if (carrierName !== undefined && !signals[carrierName]) {
        bag.report('unknown-signal', 'signal.unknown', { name: carrierName }, stmt.span);
        carrierName = undefined;
      }

      // Each end is judged by what its own port declares. The signal named on the link
      // describes the cable, and only fills in for an end that declares nothing — if it
      // spoke for both ends it would compare a type against itself and never catch a
      // mismatch, which is precisely the case worth catching.
      const generic = signals['generic']!;
      // The ends are judged by the carrier when one was named, because the carrier is what
      // the ports physically are: an RJ45 socket is an RJ45 socket whether the run carries
      // NDI or Dante. Without a carrier the signal speaks for the run, as before.
      const endName = carrierName ?? signalName;
      const fromSignal = signals[resolveEnd(fromPort, endName)] ?? generic;
      const toSignal = signals[resolveEnd(toPort, endName)] ?? generic;
      const carrier = carrierName === undefined ? undefined : signals[carrierName];

      // An end that declares the carrier itself is right, not mismatched. `ndi over wifi`
      // into a port declared `wifi` is the whole point of writing `over`: the payload rides
      // on the carrier, and the socket it plugs into is a socket for the carrier. Judged
      // without knowing that, the check compared `ndi` against `wifi`, found air meeting
      // copper, and asked for a transmitter that is already there.
      // Both ends declaring the carrier is the run working as written: `ndi over wifi`
      // between two Wi-Fi sockets is a radio hop carrying NDI, and judging the payload
      // against the carrier found air meeting copper and asked for a transmitter that was
      // already in the drawing.
      //
      // Both, not either. A Wi-Fi socket wired to an RJ45 socket does not become sound by
      // saying what rides on it — that is a real fault and the check still has to catch it.
      const payload = signalName === undefined ? undefined : signals[signalName];
      // `over` says these two travel together, so a socket for either is a socket this run
      // can plug into. A camera declares `ndi` and the access point declares `wifi`; both
      // are right, and comparing one against the other found air meeting copper and asked
      // for a transmitter that was already in the drawing.
      //
      // Both ends, not either. A Wi-Fi socket wired to an RJ45 socket does not become sound
      // by saying what rides on it — that is a real fault and the check still catches it.
      const onThisRun = (type: SignalType) =>
        carrier !== undefined &&
        payload !== undefined &&
        (type.name === carrier.name || type.name === payload.name);
      const [fromEnd, toEnd] =
        onThisRun(fromSignal) && onThisRun(toSignal) && payload !== undefined
          ? [payload, payload]
          : [fromSignal, toSignal];

      const compatibility = checkCompatibility(fromEnd, toEnd, {
        overrides: compatRules,
        hasAdapter: stmt.via !== undefined,
        locale,
      });

      // Direction. Implicit ports have no declared direction, so they never conflict.
      if (stmt.arrow === '->' && !fromPort.implicit && !toPort.implicit) {
        if (fromPort.direction === 'in') {
          bag.report('direction-mismatch', 'link.direction-out', { id: fromPort.id }, stmt.span);
        }
        if (toPort.direction === 'out') {
          bag.report('direction-mismatch', 'link.direction-in', { id: toPort.id }, stmt.span);
        }
      }

      // Compatibility.
      if (compatibility.verdict === 'incompatible') {
        const code = stmt.via !== undefined ? 'adapter-insufficient' : 'signal-mismatch';
        bag.report(
          code,
          'link.verdict',
          {
            from: fromPort.id,
            to: toPort.id,
            reason: reasonOf(compatibility, 'verdict.mismatch', locale),
          },
          stmt.span,
        );
      } else if (compatibility.verdict === 'lossy') {
        const code = compatibility.adapter !== undefined ? 'adapter-required' : 'signal-mismatch';
        bag.report(
          code,
          'link.verdict',
          {
            from: fromPort.id,
            to: toPort.id,
            reason: reasonOf(compatibility, 'verdict.caution', locale),
          },
          stmt.span,
        );
      }

      // Duplicates and overbooked inputs.
      const key = `${fromPort.id} ${toPort.id}`;
      if (seenPairs.has(key)) {
        bag.report(
          'duplicate-connection',
          'link.duplicate',
          { pair: key.replace(' ', ' → ') },
          stmt.span,
        );
      }
      seenPairs.add(key);

      // Two cables do not go into one socket — but this is a fact about sockets, and a
      // radio has none. An access point with five laptops on it is not overbooked, it is
      // an access point. The carrier decides, as it does everywhere else: what reaches
      // this end is a wire or it is the air.
      const throughAir = (carrier ?? signals[signalName ?? ''] ?? toSignal).wireless === true;
      if (stmt.arrow === '->' && !throughAir) {
        const count = (inboundCount.get(toPort.id) ?? 0) + 1;
        inboundCount.set(toPort.id, count);
        if (count > 1) {
          bag.report('port-overbooked', 'link.overbooked', { id: toPort.id }, stmt.span);
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
      if (carrier !== undefined) link.carrier = carrier;

      // `[poe]` — power sharing the Cat lead, not a second cable. Only where a Cat lead is
      // what is being drawn: nothing puts power down an SDI coax, and an author who wrote
      // it there meant something else.
      const poe = stmt.attrs.find((a) => a.key === 'poe');
      if (poe !== undefined && String(poe.value.value) !== 'false') {
        const over = link.carrier ?? link.signal;
        if (over.connectors.includes('RJ45')) {
          link.poe = true;
        } else {
          bag.report(
            'invalid-value',
            'link.poe-not-ethernet',
            { signal: localise(over.label, locale) },
            poe.span,
          );
        }
      }

      if (stmt.length !== undefined) link.length = stmt.length;
      if (stmt.label !== undefined) link.label = stmt.label;
      if (stmt.via !== undefined) link.via = stmt.via;

      // A wireless link has nothing to measure and nothing to adapt. Carrying either
      // over from a copy-pasted cable line is a mistake worth naming.
      //
      // The carrier decides this when there is one: NDI over Wi-Fi has a channel and
      // nothing to coil, and the same NDI over Cat has a length and nothing to tune.
      const wireless =
        carrier !== undefined
          ? carrier.wireless === true
          : fromSignal.wireless || toSignal.wireless;
      if (wireless) {
        if (stmt.length !== undefined) {
          bag.report('invalid-value', 'link.wireless-length', { value: stmt.length }, stmt.span);
          delete link.length;
        }
        if (stmt.via !== undefined) {
          bag.report('invalid-value', 'link.wireless-via', {}, stmt.span);
          delete link.via;
        }
        const radio = stmt.attrs.find((a) => a.key === 'freq' || a.key === 'ch');
        if (radio) {
          link.frequency = radio.key === 'ch' ? `ch ${radio.value.value}` : radio.value.value;
        }
      } else {
        // The mirror of the rule above, which was missing: a length on a radio path has
        // always been reported, but a channel on a cable was read by nothing and said
        // nothing. Both are the same mistake — a line copied from the other kind of run.
        const radio = stmt.attrs.find((a) => a.key === 'freq' || a.key === 'ch');
        if (radio) {
          bag.report(
            'invalid-value',
            'link.cabled-channel',
            { key: radio.key, value: radio.value.value },
            radio.span,
          );
        }
      }

      const written = stmt.attrs.find((a) => a.key === 'color');
      if (written) {
        const color = resolveCableColor(written.value.value);
        if (color) {
          link.color = color;
        } else {
          bag.report('invalid-value', 'value.colour', { value: written.value.value }, written.span);
        }
      }

      links.push(link);
    }
  }

  // ── adapters that are really cables ─────────────────────────────────────
  //
  // An `adapter` makes a node, which is right for a part with sockets on it and wrong for
  // a lead: a node in the middle of one unbroken cable is a stop that is not there.
  //
  // Not decided by the number of ends. A USB-HDMI dongle has two and is a junction — the
  // USB tail is moulded on, the HDMI side is a socket, and the cable that reaches it is
  // one somebody has to bring. What separates them is whether any end is a socket at all,
  // and that is already written down: a run touching an adapter is captive unless it
  // carries a length or a cable number.
  for (const id of table.order) {
    const device = table.byId.get(id)!;
    if (!device.passive) continue;
    // `as cable` is the author saying this already: it is one cable, and here is its number.
    // Telling them to write it as `via` instead would be telling them to undo the more
    // precise of the two ways of saying the same thing — `via` names a part on somebody
    // else's run, `as cable` gives the part a row and a number of its own.
    if (device.cable !== undefined) continue;

    const touching = links.filter(
      (l) => l.from.deviceId === device.id || l.to.deviceId === device.id,
    );
    if (touching.length === 0) continue;

    const everyEndCaptive = touching.every((l) => l.length === undefined && l.label === undefined);
    if (everyEndCaptive && device.ports.length <= 2) {
      bag.report('invalid-value', 'adapter.two-ended', { id: device.id }, device.span);
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
        bag.report('unconnected-port', 'port.unconnected', { id: port.id }, port.span);
      }
    }
  }

  const diagram: Diagram = {
    direction: collector.direction,
    ...(collector.ordered ? { ordered: true } : {}),
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
