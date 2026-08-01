/**
 * The resolved diagram: everything the renderer and the exporters need, and nothing
 * that still refers back to source syntax.
 *
 * The AST keeps what the author wrote; the model keeps what it means. Port ranges are
 * expanded, implicit devices exist, signal types are resolved objects rather than names,
 * and every link carries the verdict of its compatibility check.
 */

import type { ArrowKind, PortDirection } from './ast.js';
import type { CompatibilityResult, CompatibilityRule } from './compatibility.js';
import type { SourceSpan } from './diagnostics.js';
import type { SignalRegistry, SignalType } from './signals.js';

/**
 * Device kinds kumihimo knows how to draw.
 *
 * An unrecognised kind still renders, as a generic box, with a diagnostic.
 */
export const DEVICE_KINDS: readonly string[] = [
  'camera',
  'switcher',
  'mixer',
  'recorder',
  'player',
  'display',
  'projector',
  'speaker',
  'microphone',
  'amplifier',
  'computer',
  'converter',
  // The two ends of a radio path. Named separately rather than folded into `interface`
  // because which end a box is decides where the signal is going, and a schedule that
  // says "interface ×4" does not tell anyone what to pack.
  'transmitter',
  'receiver',
  'matrix',
  'patchbay',
  'router',
  'interface',
  'generic',
];

/** A single connector on a device. */
export interface Port {
  /** Unique within the diagram, formed as `deviceId.name`. */
  id: string;
  /** Name as it appears on the device, e.g. `SDI` or `12`. */
  name: string;
  /** Device this port belongs to. */
  deviceId: string;
  /** Which way signal flows. */
  direction: PortDirection;
  /**
   * Signal type this port is drawn and reported as — the first one declared.
   *
   * A connector that takes more than one thing still has to be one colour on the drawing
   * and one row in the schedule, and the first name the author wrote is the least
   * surprising choice for both.
   */
  signal?: string;
  /**
   * Everything the connector accepts, when that is more than one thing.
   *
   * A combo jack declared `xlr | trs` lists both. Only compatibility reads this; the
   * drawing and the schedules go by {@link Port.signal}.
   */
  accepts?: string[];
  /**
   * The connector on the equipment, when the author said which.
   *
   * Only meaningful where the signal type offers a choice. What matters downstream is what
   * plugs into it — which for a gendered type is the opposite gender, and otherwise the
   * same thing.
   */
  connector?: string;
  /**
   * Whether the port was invented because a connection referred to it.
   *
   * Implicit ports carry no declared direction, so direction checking skips them.
   */
  implicit: boolean;
  /**
   * Blank space to leave above this port, in gap steps, from `gap` lines in the source.
   *
   * Carried on the port rather than the declaration because a declaration expands into
   * many ports and only the first of them starts a new block. Layout is the only thing
   * that reads it; nothing about the system it describes changes.
   */
  gapBefore?: number;
  /** Where the port was declared, when it was. */
  span?: SourceSpan;
}

/** A piece of equipment. */
export interface Device {
  /** Identifier connections refer to. */
  id: string;
  /** Name drawn on the diagram. */
  label: string;
  /** Kind, which picks the shape. */
  kind: string;
  /** Ports in declaration order. */
  ports: Port[];
  /** `@key` metadata, in declaration order. */
  meta: Record<string, string>;
  /** Group this device sits in, when it is in one. */
  groupId?: string;
  /** Whether the device was invented because a connection referred to it. */
  implicit: boolean;
  /**
   * Whether this is a passive part rather than equipment.
   *
   * Declared with `adapter` instead of `device`. It carries ports and links like anything
   * else — that is what makes it reachable — but it belongs on the parts list rather than
   * the equipment list, and the connectors either side of it are plugs, not cable runs.
   */
  passive: boolean;
  /**
   * How a passive part is scheduled, when it is one.
   *
   * Present only for an `adapter … as cable`: the part is a cable as well as a part, so it
   * is listed among the cables and left off the parts list rather than counted on both.
   */
  cable?: { length?: string; label?: string };
  /** Where the device was declared, when it was. */
  span?: SourceSpan;
}

/** A frame drawn around a set of devices. */
export interface Group {
  /** Identifier for the group. */
  id: string;
  /** Name drawn on the frame. */
  label: string;
  /** Devices inside, in declaration order. */
  deviceIds: string[];
  /** Where the group was declared. */
  span?: SourceSpan;
}

/** One end of a resolved link. */
export interface LinkEnd {
  /** Device at this end. */
  deviceId: string;
  /** Port on that device. */
  portName: string;
}

/** A cable between two ports. */
export interface Link {
  /** Unique within the diagram. */
  id: string;
  /** Source end. */
  from: LinkEnd;
  /** Destination end. */
  to: LinkEnd;
  /** Directionality as written. */
  arrow: ArrowKind;
  /** Resolved signal type travelling along this cable. */
  signal: SignalType;
  /**
   * What the signal is riding on, when the author said so with `over`.
   *
   * Absent on an ordinary run, where the signal is its own carrier. When present it is the
   * carrier that decides the physics — the connector, cable or air, and whether the ends
   * can meet — while {@link Link.signal} stays what the drawing is about.
   */
  carrier?: SignalType;
  /**
   * Stroke colour overriding the signal's, resolved from `[color=…]`.
   *
   * This is the jacket colour of the actual cable, not a styling whim: it is how a run
   * gets identified on site, so it is drawn as written and carried into cable schedules.
   */
  color?: string;
  /** Cable length as written, e.g. `10m`. */
  length?: string;
  /** Cable number or name. */
  label?: string;
  /** Passive adapter declared with `via`. */
  via?: string;
  /**
   * Frequency or channel a wireless link runs on, from `[freq=…]` or `[ch=…]`.
   *
   * This is the wireless equivalent of a cable length: the fact you need on site in order
   * to make the link work, and the one that causes a clash if two systems share it.
   */
  frequency?: string;
  /** Extra attributes from a `[…]` list. */
  attrs: Record<string, string>;
  /** Verdict of the compatibility check, including any reason and required adapter. */
  compatibility: CompatibilityResult;
  /** Where the connection was written. */
  span?: SourceSpan;
}

/** Direction the diagram flows. */
export type FlowDirection = 'LR' | 'TB';

/** A fully resolved diagram. */
export interface Diagram {
  /** Title drawn on the diagram. */
  title?: string;
  /** Direction the layout flows. */
  direction: FlowDirection;
  /** Remaining `diagram` block options, unparsed. */
  options: Record<string, string>;
  /** Every device, including implicit ones, in declaration order. */
  devices: Device[];
  /** Every group in declaration order. */
  groups: Group[];
  /** Every link in declaration order. */
  links: Link[];
  /** Signal types in effect, builtins merged with `signal` declarations. */
  signals: SignalRegistry;
  /** Compatibility overrides in effect, from `compat` declarations. */
  compatRules: readonly CompatibilityRule[];
}

/**
 * Look up a device by id.
 *
 * @param diagram - Diagram to search.
 * @param id - Device identifier.
 * @returns The device, or `undefined` when no device has that id.
 */
export function findDevice(diagram: Diagram, id: string): Device | undefined {
  return diagram.devices.find((d) => d.id === id);
}

/**
 * Look up a port by device id and port name.
 *
 * @param diagram - Diagram to search.
 * @param deviceId - Device the port sits on.
 * @param portName - Name of the port.
 * @returns The port, or `undefined` when it does not exist.
 */
export function findPort(diagram: Diagram, deviceId: string, portName: string): Port | undefined {
  return findDevice(diagram, deviceId)?.ports.find((p) => p.name === portName);
}
