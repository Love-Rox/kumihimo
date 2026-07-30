/**
 * Cable, equipment and adapter schedules, rendered as tables.
 */

import type { ReactNode } from 'react';

import type { Diagram } from '@love-rox/kumihimo-core';
import { adapterSchedule, cableSchedule, equipmentSchedule } from '@love-rox/kumihimo-core';

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
}

interface Column {
  key: string;
  head: string;
}

const COLUMNS: Record<ScheduleKind, Column[]> = {
  cable: [
    { key: 'label', head: '番号' },
    { key: 'fromDevice', head: '送出' },
    { key: 'from', head: '' },
    { key: 'toDevice', head: '受け' },
    { key: 'to', head: '' },
    { key: 'signalLabel', head: '信号' },
    { key: 'length', head: '長さ' },
    { key: 'frequency', head: '周波数' },
    { key: 'connectors', head: 'コネクタ' },
    { key: 'adapter', head: '変換部材' },
    { key: 'note', head: '備考' },
  ],
  equipment: [
    { key: 'label', head: '機器' },
    { key: 'id', head: 'id' },
    { key: 'kind', head: '種別' },
    { key: 'group', head: '設置' },
    { key: 'ports', head: 'ポート数' },
    { key: 'meta', head: '備考' },
  ],
  adapter: [
    { key: 'adapter', head: '部材' },
    { key: 'count', head: '数量' },
    { key: 'links', head: '対象' },
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
export function ScheduleTable({ diagram, kind }: ScheduleTableProps): ReactNode {
  if (!diagram) return <p className="khm-schedule khm-schedule--empty">まだ図がありません</p>;

  const rows: Record<string, unknown>[] =
    kind === 'cable'
      ? (cableSchedule(diagram) as unknown as Record<string, unknown>[])
      : kind === 'equipment'
        ? (equipmentSchedule(diagram) as unknown as Record<string, unknown>[])
        : (adapterSchedule(diagram) as unknown as Record<string, unknown>[]);

  if (rows.length === 0) {
    return <p className="khm-schedule khm-schedule--empty">該当なし</p>;
  }

  const columns = COLUMNS[kind];

  return (
    <div className="khm-schedule">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.head}</th>
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
