/**
 * Schedules derived from a diagram: what to pull, what to rack, what to pack.
 *
 * A drawing tells you how the system connects. A schedule tells you what to put in the
 * van, and it is the document that actually travels to site. Deriving it from the same
 * model is the whole reason the length, the jacket colour and the adapter are properties
 * of a link rather than decoration on a picture.
 */

import type { Locale } from './messages.js';
import { DEFAULT_LOCALE, localise } from './messages.js';
import type { Diagram, Link } from './model.js';

/** Whether a link is a physical cable or a radio path. */
export type LinkMedium = 'cable' | 'wireless';

/** One row of the cable schedule. */
export interface CableRow {
  /** Cable number as written, e.g. `V-01`. */
  label?: string;
  /** Source, as `deviceId.port`. */
  from: string;
  /** Source device's drawn name. */
  fromDevice: string;
  /** Destination, as `deviceId.port`. */
  to: string;
  /** Destination device's drawn name. */
  toDevice: string;
  /** Signal type name, e.g. `sdi`. */
  signal: string;
  /** Signal type's drawn name, e.g. `SDI`. */
  signalLabel: string;
  /** Cable or radio. */
  medium: LinkMedium;
  /** Cable length as written. Absent on a radio path. */
  length?: string;
  /** Frequency or channel. Absent on a cable. */
  frequency?: string;
  /** Jacket colour as resolved, when one was written. */
  color?: string;
  /** Connectors this signal is typically terminated with. */
  connectors: string[];
  /** Passive adapter this run needs, declared or detected. */
  adapter?: string;
  /** Why this run was flagged, when it was. */
  note?: string;
}

/** One row of the equipment schedule. */
export interface EquipmentRow {
  /** Identifier used in the source. */
  id: string;
  /** Name drawn on the diagram. */
  label: string;
  /** Device kind. */
  kind: string;
  /** Group the device sits in, when it is in one. */
  group?: string;
  /** How many ports it has, after ranges are expanded. */
  ports: number;
  /** `@key` metadata, e.g. vendor or rack units. */
  meta: Record<string, string>;
  /**
   * Whether the device was never declared and only exists because a link named it.
   *
   * An implicit device on an equipment list is a gap in the drawing, not a thing to
   * order, so it is flagged rather than silently listed.
   */
  implicit: boolean;
}

/** One row of the adapter schedule. */
export interface AdapterRow {
  /** What to order, in the words used on an invoice. */
  adapter: string;
  /** How many are needed. */
  count: number;
  /** Cable numbers, or endpoint pairs where a run has no number. */
  links: string[];
}

function endpointName(diagram: Diagram, deviceId: string): string {
  return diagram.devices.find((d) => d.id === deviceId)?.label ?? deviceId;
}

/**
 * Whether a run is a cable someone has to bring, rather than a plug going into a socket.
 *
 * Both ends of an `adapter` are usually its own connectors: a headset splitter is one
 * moulded part, and the headphone plugs straight into it. Listing those as cable runs puts
 * three lines on the schedule for a thing that is one line item.
 *
 * The exception is written, not guessed. A run touching an adapter that carries a length
 * or a cable number is a cable — someone measured it or numbered it, which is exactly the
 * act of saying "this one is a cable". Either alone is enough, because a length is often
 * unknown when the drawing is made and a number is often assigned before it is measured.
 *
 * @param diagram - The resolved diagram.
 * @param link - The run to judge.
 * @returns Whether the run belongs on the cable schedule.
 */
function isCableRun(diagram: Diagram, link: Link): boolean {
  const passive = (id: string) => diagram.devices.find((d) => d.id === id)?.passive === true;
  if (!passive(link.from.deviceId) && !passive(link.to.deviceId)) return true;
  return link.length !== undefined || link.label !== undefined;
}

function describe(link: Link): string {
  return (
    link.label ??
    `${link.from.deviceId}.${link.from.portName} → ${link.to.deviceId}.${link.to.portName}`
  );
}

/**
 * Every link as a row, cables and radio paths alike.
 *
 * Radio paths are included rather than filtered out: they are part of the system and
 * someone has to check the frequency, even though there is nothing to coil.
 *
 * @param diagram - The resolved diagram.
 * @returns Rows in the order the links were written.
 */
export function cableSchedule(diagram: Diagram, locale: Locale = DEFAULT_LOCALE): CableRow[] {
  return diagram.links
    .filter((link) => isCableRun(diagram, link))
    .map((link) => {
      const row: CableRow = {
        from: `${link.from.deviceId}.${link.from.portName}`,
        fromDevice: endpointName(diagram, link.from.deviceId),
        to: `${link.to.deviceId}.${link.to.portName}`,
        toDevice: endpointName(diagram, link.to.deviceId),
        signal: link.signal.name,
        signalLabel: localise(link.signal.label, locale) || link.signal.name,
        medium: link.signal.wireless ? 'wireless' : 'cable',
        connectors: link.signal.connectors,
      };
      if (link.label !== undefined) row.label = link.label;
      if (link.length !== undefined) row.length = link.length;
      if (link.frequency !== undefined) row.frequency = link.frequency;
      if (link.color !== undefined) row.color = link.color;
      if (link.compatibility.adapter !== undefined) {
        row.adapter = localise(link.compatibility.adapter, locale);
      }
      if (link.via !== undefined) row.adapter = link.via;
      if (link.compatibility.verdict !== 'ok' && link.compatibility.reason !== undefined) {
        row.note = localise(link.compatibility.reason, locale);
      }
      return row;
    });
}

/**
 * Every device as a row.
 *
 * @param diagram - The resolved diagram.
 * @returns Rows in declaration order.
 */
export function equipmentSchedule(diagram: Diagram): EquipmentRow[] {
  // Adapters are parts, not equipment. Nobody racks a headset splitter.
  return diagram.devices
    .filter((device) => !device.passive)
    .map((device) => {
      const row: EquipmentRow = {
        id: device.id,
        label: device.label,
        kind: device.kind,
        ports: device.ports.length,
        meta: device.meta,
        implicit: device.implicit,
      };
      if (device.groupId !== undefined) {
        row.group = diagram.groups.find((g) => g.id === device.groupId)?.label ?? device.groupId;
      }
      return row;
    });
}

/**
 * Adapters the system needs, counted.
 *
 * Includes runs where kumihimo worked out an adapter is required but the author has not
 * declared one — an adapter nobody wrote down is an adapter nobody brings.
 *
 * @param diagram - The resolved diagram.
 * @returns One row per distinct adapter, most needed first.
 */
export function adapterSchedule(diagram: Diagram, locale: Locale = DEFAULT_LOCALE): AdapterRow[] {
  const rows = new Map<string, AdapterRow>();

  // Parts declared with `adapter`. Counted once each, however many runs touch them: it is
  // one object, and the schedule is a list of things to put in the van.
  for (const device of diagram.devices) {
    if (!device.passive) continue;
    const touching = diagram.links.filter(
      (l) => l.from.deviceId === device.id || l.to.deviceId === device.id,
    );
    const existing = rows.get(device.label);
    const where = touching.map((l) => describe(l));
    if (existing) {
      existing.count += 1;
      existing.links.push(...where);
    } else {
      rows.set(device.label, { adapter: device.label, count: 1, links: where });
    }
  }

  for (const link of diagram.links) {
    const source = link.via ?? link.compatibility.adapter;
    if (source === undefined) continue;
    // The part name is the key, so it has to be one language before it is counted.
    const adapter = localise(source, locale);
    const existing = rows.get(adapter);
    if (existing) {
      existing.count += 1;
      existing.links.push(describe(link));
    } else {
      rows.set(adapter, { adapter, count: 1, links: [describe(link)] });
    }
  }

  return [...rows.values()].toSorted(
    (a, b) => b.count - a.count || a.adapter.localeCompare(b.adapter),
  );
}

/**
 * One value as it appears in a cell.
 *
 * Tabs and newlines are flattened to spaces: a value carrying either would split the row
 * it belongs to, and a label with a line break in it is worth less than an intact table.
 */
function cell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(' / ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
  }
  return String(value).replace(/[\t\n]/g, ' ');
}

/**
 * Render a schedule as tab-separated values.
 *
 * TSV rather than CSV because these get pasted into a spreadsheet, and a cable label
 * containing a comma is far likelier than one containing a tab.
 *
 * @param rows - Rows to render.
 * @param columns - Column keys, in order.
 * @returns A TSV document with a header row.
 */
export function toTsv<T extends object>(rows: readonly T[], columns: readonly (keyof T)[]): string {
  return [
    columns.map(String).join('\t'),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join('\t')),
  ].join('\n');
}
