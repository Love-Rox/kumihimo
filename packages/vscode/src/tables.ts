import type { AdapterRow, CableRow, Diagram, EquipmentRow } from '@love-rox/kumihimo-core';
import { adapterSchedule, cableSchedule, equipmentSchedule } from '@love-rox/kumihimo-core';
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
 * The schedules, as HTML.
 *
 * The same three the CLI exports and the live editor shows, from the same functions — a
 * drawing and its cable list disagreeing is exactly the failure this project exists to
 * avoid, so there is one place they are computed.
 */
export function tablesOf(diagram: Diagram): Table[] {
  const cables = cableSchedule(diagram);
  const equipment = equipmentSchedule(diagram);
  const adapters = adapterSchedule(diagram);

  return [
    {
      id: 'cables',
      label: vscode.l10n.t('Cables'),
      count: cables.length,
      html: table(
        [
          vscode.l10n.t('No.'),
          vscode.l10n.t('From'),
          vscode.l10n.t('To'),
          vscode.l10n.t('Signal'),
          vscode.l10n.t('Length'),
          vscode.l10n.t('Connectors'),
          vscode.l10n.t('Note'),
        ],
        cables.map((row: CableRow) => [
          row.label ?? '',
          `${row.fromDevice} ${row.from.split('.').pop() ?? ''}`,
          `${row.toDevice} ${row.to.split('.').pop() ?? ''}`,
          row.signalLabel,
          // A radio path has no length to coil, and saying so beats an empty cell.
          row.length ?? row.frequency ?? '',
          row.connectors.join(' / '),
          [row.adapter, row.note].filter(Boolean).join(' — '),
        ]),
      ),
    },
    {
      id: 'equipment',
      label: vscode.l10n.t('Equipment'),
      count: equipment.length,
      html: table(
        [
          vscode.l10n.t('Name'),
          vscode.l10n.t('Kind'),
          vscode.l10n.t('Group'),
          vscode.l10n.t('Ports'),
          vscode.l10n.t('Metadata'),
        ],
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
      label: vscode.l10n.t('Adapters'),
      count: adapters.length,
      html: table(
        [vscode.l10n.t('Part'), vscode.l10n.t('Qty'), vscode.l10n.t('Runs')],
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
