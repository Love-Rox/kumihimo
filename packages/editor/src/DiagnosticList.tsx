/**
 * The diagnostics panel.
 */

import type { ReactNode } from 'react';

import type { Diagnostic } from '@love-rox/kumihimo-core';

/** Props accepted by {@link DiagnosticList}. */
export interface DiagnosticListProps {
  /** Diagnostics to show, in the order they were reported. */
  diagnostics: readonly Diagnostic[];
  /** Called when a row is activated, so the editor can move the caret to it. */
  onSelect?: (diagnostic: Diagnostic) => void;
}

/**
 * List diagnostics, each one clickable.
 *
 * Rows are buttons rather than clickable divs so the panel works from the keyboard: a
 * list of faults you can only reach with a mouse is a list half the people who need it
 * cannot use.
 *
 * @param props - Diagnostics and a selection callback.
 * @returns The panel.
 */
export function DiagnosticList({ diagnostics, onSelect }: DiagnosticListProps): ReactNode {
  if (diagnostics.length === 0) {
    return (
      <p className="khm-diagnostics khm-diagnostics--clean" role="status">
        問題は見つかりませんでした
      </p>
    );
  }

  return (
    <ul className="khm-diagnostics" aria-label="診断">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${index}`}>
          <button
            type="button"
            className={`khm-diagnostic khm-diagnostic--${diagnostic.severity}`}
            onClick={() => onSelect?.(diagnostic)}
          >
            <span className="khm-diagnostic__where">
              {diagnostic.span
                ? `${diagnostic.span.start.line}:${diagnostic.span.start.column}`
                : '—'}
            </span>
            <span className="khm-diagnostic__severity">{diagnostic.severity}</span>
            <span className="khm-diagnostic__code">{diagnostic.code}</span>
            <span className="khm-diagnostic__message">{diagnostic.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
