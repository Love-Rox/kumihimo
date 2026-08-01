import type {
  AdapterRow,
  CableRow,
  Diagram,
  EquipmentRow,
  Locale,
  ScheduleKind,
  WirelessRow,
} from '@love-rox/kumihimo-core';
import {
  SCHEDULES,
  adapterSchedule,
  cableSchedule,
  equipmentSchedule,
  localise,
  wirelessSchedule,
} from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

/** One rendered table: what to call it, and its HTML. */
export interface Table {
  id: string;
  label: string;
  /** Rows behind it, so a pane can say "empty" rather than draw a headed table with nothing in it. */
  count: number;
  html: string;
}

/**
 * Column headings for the keys this pane shows, in the words the registry gives them.
 *
 * The pane shows fewer columns than a spreadsheet export does — a device and its port
 * share one cell, because this lives in a sidebar and two narrow columns there read worse
 * than one. What it must not do is invent its own words for them: a heading that says one
 * thing here and another in the CLI names two different things to whoever reads both.
 *
 * @param kind - Which schedule.
 * @param keys - The row properties this table shows, in order.
 * @param locale - Language for the headings.
 * @returns The headings.
 */
function headings(kind: ScheduleKind, keys: readonly string[], locale: Locale): string[] {
  const { columns } = SCHEDULES[kind];
  return keys.map((key) => {
    const head = columns.find((column) => column.key === key)?.head;
    return head === undefined ? key : localise(head, locale);
  });
}

/** A device and its port in one cell, which is how this pane shows an endpoint. */
function endpoint(device: string, ref: string): string {
  return `${device} ${ref.split('.').pop() ?? ''}`;
}

/**
 * The schedules, as HTML.
 *
 * The same four the CLI exports and the live editor shows, from the same functions — a
 * drawing and its cable list disagreeing is exactly the failure this project exists to
 * avoid, so there is one place they are computed.
 */
export function tablesOf(diagram: Diagram, locale: Locale = 'en'): Table[] {
  // The typed functions, not `SCHEDULES[kind].rows` — this pane reads named properties off
  // each row and composes them, so it wants the shape. The registry's loose row type is
  // for a caller driving a generic table off the column list, and casting back out of it
  // here would be trading a checked read for an unchecked one.
  const cables = cableSchedule(diagram, locale);
  const radio = wirelessSchedule(diagram, locale);
  const equipment = equipmentSchedule(diagram);
  const adapters = adapterSchedule(diagram, locale);

  return [
    {
      id: 'cables',
      label: localise(SCHEDULES.cable.title, locale),
      count: cables.length,
      html: table(
        headings(
          'cable',
          ['label', 'fromDevice', 'toDevice', 'signalLabel', 'length', 'connectors', 'note'],
          locale,
        ),
        cables.map((row: CableRow) => [
          row.label ?? '',
          endpoint(row.fromDevice, row.from),
          endpoint(row.toDevice, row.to),
          row.signalLabel,
          row.length ?? '',
          row.connectors.join(' / '),
          // The part a run needs and why it was flagged are both "things to know about
          // this cable", and in a sidebar they earn one column between them.
          [row.adapter, row.note].filter(Boolean).join(' \u2014 '),
        ]),
      ),
    },
    {
      id: 'wireless',
      label: localise(SCHEDULES.wireless.title, locale),
      count: radio.length,
      html: table(
        headings(
          'wireless',
          ['label', 'fromDevice', 'toDevice', 'signalLabel', 'carrierLabel', 'frequency', 'note'],
          locale,
        ),
        radio.map((row: WirelessRow) => [
          row.label ?? '',
          endpoint(row.fromDevice, row.from),
          endpoint(row.toDevice, row.to),
          row.signalLabel,
          row.carrierLabel ?? '',
          row.frequency ?? '',
          row.note ?? '',
        ]),
      ),
    },
    {
      id: 'equipment',
      label: localise(SCHEDULES.equipment.title, locale),
      count: equipment.length,
      html: table(
        headings('equipment', ['label', 'kind', 'group', 'ports', 'meta'], locale),
        equipment.map((row: EquipmentRow) => [
          // An implicit device is a gap in the drawing rather than a thing to order.
          row.implicit ? `${row.label} ${vscode.l10n.t('(undeclared)')}` : row.label,
          row.kind,
          row.group ?? '',
          String(row.ports),
          Object.entries(row.meta)
            .map(([key, value]) => `${key}=${value}`)
            .join(' '),
        ]),
      ),
    },
    {
      id: 'adapters',
      label: localise(SCHEDULES.adapter.title, locale),
      count: adapters.length,
      html: table(
        headings('adapter', ['adapter', 'count', 'links'], locale),
        adapters.map((row: AdapterRow) => [row.adapter, String(row.count), row.links.join(', ')]),
      ),
    },
  ];
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function table(head: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<p class="empty">${escape(vscode.l10n.t('Nothing here yet.'))}</p>`;
  }

  const header = head.map((cell) => `<th>${escape(cell)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}
