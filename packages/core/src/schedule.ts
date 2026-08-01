/**
 * Schedules derived from a diagram: what to pull, what to rack, what to pack.
 *
 * A drawing tells you how the system connects. A schedule tells you what to put in the
 * van, and it is the document that actually travels to site. Deriving it from the same
 * model is the whole reason the length, the jacket colour and the adapter are properties
 * of a link rather than decoration on a picture.
 */

import type { Locale, Localised } from './messages.js';
import { DEFAULT_LOCALE, localise } from './messages.js';
import type { Diagram, Link } from './model.js';

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
  /** Cable length as written. */
  length?: string;
  /** Jacket colour as resolved, when one was written. */
  color?: string;
  /** Connectors this signal is typically terminated with. */
  connectors: string[];
  /** Passive adapter this run needs, declared or detected. */
  adapter?: string;
  /** Why this run was flagged, when it was. */
  note?: string;
}

/**
 * One row of the wireless schedule.
 *
 * A radio path has no length, no connector and nothing to coil, so it has no business on a
 * list of cables to pull. What it does have is a frequency somebody has to co-ordinate,
 * which is a different job done by a different person — hence a different sheet.
 */
export interface WirelessRow {
  /** Number as written, when the author numbered the path. */
  label?: string;
  /** Transmitting end, as `deviceId.port`. */
  from: string;
  /** Transmitting device's drawn name. */
  fromDevice: string;
  /** Receiving end, as `deviceId.port`. */
  to: string;
  /** Receiving device's drawn name. */
  toDevice: string;
  /** Signal type name, e.g. `ndi`. */
  signal: string;
  /** Signal type's drawn name, e.g. `NDI`. */
  signalLabel: string;
  /**
   * What the signal is riding on, when `over` named something.
   *
   * NDI over Wi-Fi is an NDI row whose carrier is Wi-Fi. The frequency belongs to the
   * carrier and the name belongs to the payload, which is the whole reason they are
   * separate columns.
   */
  carrier?: string;
  /** Carrier's drawn name. */
  carrierLabel?: string;
  /** Frequency or channel as written. */
  frequency?: string;
  /** Why this path was flagged, when it was. */
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

/** Whether the physics of this run belongs to the air rather than to a cable. */
function isWireless(link: Link): boolean {
  // The carrier decides, when the author named one: an NDI hop over Wi-Fi is a radio path
  // however many RJ45s `ndi` itself lists.
  return (link.carrier ?? link.signal).wireless === true;
}

/**
 * Every cable as a row.
 *
 * Radio paths are not here. They were, once, on the reasoning that they are part of the
 * system and somebody has to check the frequency — which is true, and is an argument for
 * listing them, not for listing them *here*. This is the sheet someone packs a van from,
 * and a row with no length, no connector and nothing to coil reads as a cable that was
 * never measured. {@link wirelessSchedule} has them.
 *
 * @param diagram - The resolved diagram.
 * @param locale - Language for the drawn names and any note.
 * @returns Rows in the order the links were written.
 */
export function cableSchedule(diagram: Diagram, locale: Locale = DEFAULT_LOCALE): CableRow[] {
  // A moulded lead declared `as cable` is one object with several plugs on it, so it gets
  // one row rather than one per plug. The far ends go in the "to" column together: the
  // person loading the van needs to know where it reaches, and a fan-out reaches several
  // places at once.
  const moulded: CableRow[] = diagram.devices
    .filter((device) => device.passive && device.cable !== undefined)
    .map((device) => {
      const touching = diagram.links.filter(
        (l) => l.from.deviceId === device.id || l.to.deviceId === device.id,
      );
      const others = [
        ...new Set(
          touching.map((l) =>
            endpointName(diagram, l.from.deviceId === device.id ? l.to.deviceId : l.from.deviceId),
          ),
        ),
      ];
      const signal = touching[0]?.signal;

      const row: CableRow = {
        from: device.id,
        fromDevice: device.label,
        to: others.join(' / '),
        toDevice: others.join(' / '),
        signal: signal?.name ?? 'generic',
        signalLabel: signal === undefined ? '' : localise(signal.label, locale) || signal.name,
        // From the signals its ports carry: a Port names a type, and the type is what
        // knows how it is terminated.
        connectors: [
          ...new Set(
            device.ports.flatMap((p) =>
              p.signal === undefined ? [] : (diagram.signals[p.signal]?.connectors ?? []),
            ),
          ),
        ],
      };
      if (device.cable?.label !== undefined) row.label = device.cable.label;
      if (device.cable?.length !== undefined) row.length = device.cable.length;
      return row;
    });

  return diagram.links
    .filter((link) => !isWireless(link) && isCableRun(diagram, link))
    .map((link) => {
      const row: CableRow = {
        from: `${link.from.deviceId}.${link.from.portName}`,
        fromDevice: endpointName(diagram, link.from.deviceId),
        to: `${link.to.deviceId}.${link.to.portName}`,
        toDevice: endpointName(diagram, link.to.deviceId),
        signal: link.signal.name,
        signalLabel: localise(link.signal.label, locale) || link.signal.name,
        // The connectors belong to the carrier when the author named one: what is crimped
        // on the end is a property of the cable, not of what rides down it.
        connectors: (link.carrier ?? link.signal).connectors,
      };
      if (link.label !== undefined) row.label = link.label;
      if (link.length !== undefined) row.length = link.length;
      if (link.color !== undefined) row.color = link.color;
      if (link.compatibility.adapter !== undefined) {
        row.adapter = localise(link.compatibility.adapter, locale);
      }
      if (link.via !== undefined) row.adapter = link.via;
      if (link.compatibility.verdict !== 'ok' && link.compatibility.reason !== undefined) {
        row.note = localise(link.compatibility.reason, locale);
      }
      return row;
    })
    .concat(moulded);
}

/**
 * Every radio path as a row.
 *
 * The counterpart to {@link cableSchedule}, and the reason that one no longer carries
 * them. Nothing here is pulled, coiled or measured; what it needs is a frequency plan, and
 * the person holding that sheet is checking for two paths on one channel rather than for
 * enough cable to reach.
 *
 * @param diagram - The resolved diagram.
 * @param locale - Language for the drawn names and any note.
 * @returns Rows in the order the links were written.
 */
export function wirelessSchedule(diagram: Diagram, locale: Locale = DEFAULT_LOCALE): WirelessRow[] {
  return diagram.links.filter(isWireless).map((link) => {
    const row: WirelessRow = {
      from: `${link.from.deviceId}.${link.from.portName}`,
      fromDevice: endpointName(diagram, link.from.deviceId),
      to: `${link.to.deviceId}.${link.to.portName}`,
      toDevice: endpointName(diagram, link.to.deviceId),
      signal: link.signal.name,
      signalLabel: localise(link.signal.label, locale) || link.signal.name,
    };
    if (link.label !== undefined) row.label = link.label;
    // Only when it differs: `uhf -> uhf` writing "uhf, riding on uhf" is noise, and the
    // column exists to answer "what is it actually going over", which needs no answer
    // when the signal is its own carrier.
    if (link.carrier !== undefined && link.carrier.name !== link.signal.name) {
      row.carrier = link.carrier.name;
      row.carrierLabel = localise(link.carrier.label, locale) || link.carrier.name;
    }
    if (link.frequency !== undefined) row.frequency = link.frequency;
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
    // `as cable` moves it to the cable schedule. A row on both would be the same object
    // counted twice, which is the failure this whole area exists to avoid.
    if (device.cable !== undefined) continue;
    const touching = diagram.links.filter(
      (l) => l.from.deviceId === device.id || l.to.deviceId === device.id,
    );
    const existing = rows.get(device.label);
    // What it plugs into, not the runs it takes part in. A splitter is one part with
    // three plugs on it; listing three runs reads as three cables, which is the thing
    // this schedule exists to stop.
    const where = [
      ...new Set(
        touching.map((l) =>
          endpointName(diagram, l.from.deviceId === device.id ? l.to.deviceId : l.from.deviceId),
        ),
      ),
    ];
    if (existing) {
      existing.count += 1;
      existing.links.push(...where);
    } else {
      rows.set(device.label, { adapter: device.label, count: 1, links: where });
    }
  }

  for (const link of diagram.links) {
    // A lead that converts *is* the cable, and the cable schedule already has a row for
    // it with the part named in its adapter column. Counting it here as well would send
    // someone to site with two objects for a job that needs one.
    //
    // The compatibility check is what tells them apart: it names a lead only when the two
    // ends disagree. Where they agree, a `via` is a separate part beside an ordinary
    // cable, and belongs on this list.
    if (link.compatibility.adapter !== undefined) continue;

    const source = link.via;
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

/**
 * Which schedules exist.
 *
 * Named here rather than repeated as a union in every surface that shows one.
 */
export type ScheduleKind = 'cable' | 'wireless' | 'equipment' | 'adapter';

/** One column of a schedule. */
export interface ScheduleColumn {
  /** Property to read off the row. */
  key: string;
  /**
   * Heading, or absent for a column that continues the one before it.
   *
   * A port sits under its device's heading rather than getting one of its own, because
   * "From" and then "" reads as one thing split across two cells, which is what it is.
   */
  head?: Localised;
}

/** What a schedule is, and how to get it. */
export interface ScheduleDefinition {
  /** What the sheet is called. */
  title: Localised;
  /** Every column the rows carry, in the order a sheet would print them. */
  columns: readonly ScheduleColumn[];
  /**
   * Compute the rows.
   *
   * Typed loosely on purpose: the four row shapes have nothing in common, and a caller
   * driving the table off {@link ScheduleDefinition.columns} reads them by key anyway.
   * A caller that wants a shape calls {@link cableSchedule} and friends directly.
   */
  rows: (diagram: Diagram, locale?: Locale) => readonly Record<string, unknown>[];
}

const COL = {
  number: { en: 'No.', ja: '番号' },
  from: { en: 'From', ja: '送出' },
  to: { en: 'To', ja: '受け' },
  signal: { en: 'Signal', ja: '信号' },
  length: { en: 'Length', ja: '長さ' },
  colour: { en: 'Colour', ja: '色' },
  connectors: { en: 'Connectors', ja: 'コネクタ' },
  adapter: { en: 'Adapter', ja: '変換部材' },
  carrier: { en: 'Over', ja: '乗り物' },
  frequency: { en: 'Channel', ja: 'チャンネル' },
  note: { en: 'Note', ja: '備考' },
  device: { en: 'Device', ja: '機器' },
  kind: { en: 'Kind', ja: '種別' },
  group: { en: 'Location', ja: '設置' },
  ports: { en: 'Ports', ja: 'ポート数' },
  part: { en: 'Part', ja: '部材' },
  count: { en: 'Qty', ja: '数' },
  between: { en: 'Between', ja: 'つながる先' },
  declared: { en: 'Declared', ja: '宣言' },
} as const satisfies Record<string, Localised>;

/**
 * Every schedule, its columns and what they are called.
 *
 * One place, because there are four surfaces showing these — the CLI, the VS Code pane,
 * the live editor and the site — and adding the wireless sheet meant editing a column list
 * and a set of headings in each of them. A heading that disagrees between two of them is a
 * heading somebody will read as naming two different things.
 *
 * The registry says what exists and what it is called. **How it looks stays with each
 * surface**: a terminal wants the port ids and a web page does not, and forcing one answer
 * on both would be worse than the duplication it removed.
 */
export const SCHEDULES: Readonly<Record<ScheduleKind, ScheduleDefinition>> = {
  cable: {
    title: { en: 'Cable schedule', ja: 'ケーブル表' },
    columns: [
      { key: 'label', head: COL.number },
      // Each name is followed by the id behind it, unheaded — the drawn name is what a
      // person reads, and the id is what survives being sorted, filtered and scripted in
      // whatever the sheet gets pasted into.
      { key: 'fromDevice', head: COL.from },
      { key: 'from' },
      { key: 'toDevice', head: COL.to },
      { key: 'to' },
      { key: 'signalLabel', head: COL.signal },
      { key: 'signal' },
      { key: 'length', head: COL.length },
      { key: 'color', head: COL.colour },
      { key: 'connectors', head: COL.connectors },
      { key: 'adapter', head: COL.adapter },
      { key: 'note', head: COL.note },
    ],
    rows: (diagram, locale) =>
      cableSchedule(diagram, locale) as unknown as Record<string, unknown>[],
  },
  wireless: {
    title: { en: 'Wireless schedule', ja: '無線表' },
    // No length and no connector, because a radio path has neither. What it has is a
    // channel somebody has to co-ordinate, and what it rides on when `over` said so.
    columns: [
      { key: 'label', head: COL.number },
      { key: 'fromDevice', head: COL.from },
      { key: 'from' },
      { key: 'toDevice', head: COL.to },
      { key: 'to' },
      { key: 'signalLabel', head: COL.signal },
      { key: 'signal' },
      { key: 'carrierLabel', head: COL.carrier },
      { key: 'carrier' },
      { key: 'frequency', head: COL.frequency },
      { key: 'note', head: COL.note },
    ],
    rows: (diagram, locale) =>
      wirelessSchedule(diagram, locale) as unknown as Record<string, unknown>[],
  },
  equipment: {
    title: { en: 'Equipment list', ja: '機材表' },
    columns: [
      { key: 'label', head: COL.device },
      { key: 'id' },
      { key: 'kind', head: COL.kind },
      { key: 'group', head: COL.group },
      { key: 'ports', head: COL.ports },
      { key: 'meta', head: COL.note },
      // A device that only exists because a link named it is a gap in the drawing, not a
      // thing to order. It has to reach the sheet, or the sheet quietly asks for it.
      { key: 'implicit', head: COL.declared },
    ],
    rows: (diagram) => equipmentSchedule(diagram) as unknown as Record<string, unknown>[],
  },
  adapter: {
    title: { en: 'Parts list', ja: '部材表' },
    columns: [
      { key: 'adapter', head: COL.part },
      { key: 'count', head: COL.count },
      { key: 'links', head: COL.between },
    ],
    rows: (diagram, locale) =>
      adapterSchedule(diagram, locale) as unknown as Record<string, unknown>[],
  },
};

/** Every schedule kind, for a caller that offers all of them. */
export const SCHEDULE_KINDS = Object.keys(SCHEDULES) as readonly ScheduleKind[];

/**
 * One value as text.
 *
 * Exported because three surfaces had written their own, and they disagreed: an array of
 * connectors came out `XLR-M / XLR-F` in one and `XLR-M,XLR-F` in another, off the same row.
 *
 * @param value - Whatever the row carried.
 * @returns The text for a cell. Tabs and newlines are flattened so a value can never break
 *   the row structure of a TSV.
 */
export function formatCell(value: unknown): string {
  return cell(value);
}
