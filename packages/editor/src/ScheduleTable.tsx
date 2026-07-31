/**
 * Cable, equipment and adapter schedules, rendered as tables.
 */

import type { ReactNode } from 'react';

import type { Diagram, Locale } from '@love-rox/kumihimo-core';
import {
  DEFAULT_LOCALE,
  adapterSchedule,
  cableSchedule,
  equipmentSchedule,
} from '@love-rox/kumihimo-core';

import type { UiKey } from './messages.js';
import { t } from './messages.js';

/** Which schedule to show. */
export type ScheduleKind = 'cable' | 'equipment' | 'adapter';

/** Props accepted by {@link ScheduleTable}. */
export interface ScheduleTableProps {
  /**
   * The resolved diagram to derive rows from.
   *
   * Explicitly `| undefined` rather than optional: the caller passes the result of a
   * compile that may not have finished, and under `exactOptionalPropertyTypes` those are
   * different things.
   */
  diagram: Diagram | undefined;
  /** Which schedule to show. */
  kind: ScheduleKind;
  /** Language for the headings, and for the part names the schedule derives. */
  locale?: Locale;
}

interface Column {
  key: string;
  /** Catalogue key for the heading, or `undefined` for a column that carries no heading. */
  head?: UiKey;
}

const COLUMNS: Record<ScheduleKind, Column[]> = {
  cable: [
    { key: 'label', head: 'colNumber' },
    { key: 'fromDevice', head: 'colFrom' },
    // The port sits in its own column under the device's heading, so it has none of its own.
    { key: 'from' },
    { key: 'toDevice', head: 'colTo' },
    { key: 'to' },
    { key: 'signalLabel', head: 'colSignal' },
    { key: 'length', head: 'colLength' },
    { key: 'frequency', head: 'colFrequency' },
    { key: 'connectors', head: 'colConnectors' },
    { key: 'adapter', head: 'colAdapter' },
    { key: 'note', head: 'colNote' },
  ],
  equipment: [
    { key: 'label', head: 'colDevice' },
    { key: 'id' },
    { key: 'kind', head: 'colKind' },
    { key: 'group', head: 'colGroup' },
    { key: 'ports', head: 'colPorts' },
    { key: 'meta', head: 'colNote' },
  ],
  adapter: [
    { key: 'adapter', head: 'colPart' },
    { key: 'count', head: 'colCount' },
    { key: 'links', head: 'colLinks' },
  ],
};

function cell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(' / ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('  ');
  }
  return String(value);
}

/**
 * Show one of the schedules derived from a diagram.
 *
 * These are the documents that actually go to site, so they are part of the editor rather
 * than an export you have to know exists.
 *
 * @param props - The diagram and which schedule to render.
 * @returns The table.
 */
export function ScheduleTable({
  diagram,
  kind,
  locale = DEFAULT_LOCALE,
}: ScheduleTableProps): ReactNode {
  if (!diagram) {
    return <p className="khm-schedule khm-schedule--empty">{t('noDiagram', locale)}</p>;
  }

  const rows: Record<string, unknown>[] =
    kind === 'cable'
      ? (cableSchedule(diagram, locale) as unknown as Record<string, unknown>[])
      : kind === 'equipment'
        ? (equipmentSchedule(diagram) as unknown as Record<string, unknown>[])
        : (adapterSchedule(diagram, locale) as unknown as Record<string, unknown>[]);

  if (rows.length === 0) {
    return <p className="khm-schedule khm-schedule--empty">{t('noRows', locale)}</p>;
  }

  const columns = COLUMNS[kind];

  return (
    <div className="khm-schedule">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.head ? t(column.head, locale) : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => {
                const text = cell(row[column.key]);
                // A note is truncated to keep rows one line tall, so the full text has to
                // stay reachable on hover.
                return (
                  <td key={column.key} data-column={column.key} title={text || undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
