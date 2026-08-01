/**
 * Cable, wireless, equipment and adapter schedules, rendered as tables.
 */

import type { ReactNode } from 'react';

import type { Diagram, Locale, ScheduleKind } from '@love-rox/kumihimo-core';
import { DEFAULT_LOCALE, SCHEDULES, formatCell, localise } from '@love-rox/kumihimo-core';

import { t } from './messages.js';

export type { ScheduleKind };

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

  const schedule = SCHEDULES[kind];
  const rows = schedule.rows(diagram, locale);

  if (rows.length === 0) {
    return <p className="khm-schedule khm-schedule--empty">{t('noRows', locale)}</p>;
  }

  const columns = schedule.columns;

  return (
    <div className="khm-schedule">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.head ? localise(column.head, locale) : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => {
                const text = formatCell(row[column.key]);
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
