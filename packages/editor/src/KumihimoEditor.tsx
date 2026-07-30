/**
 * An embeddable live editor: source on one side, diagram on the other.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { CompileOptions, Diagnostic } from '@love-rox/kumihimo-core';
import { THEMES } from '@love-rox/kumihimo-core';
import { useKumihimo } from '@love-rox/kumihimo-react';

import { DiagnosticList } from './DiagnosticList.js';
import { ScheduleTable } from './ScheduleTable.js';
import type { ScheduleKind } from './ScheduleTable.js';
import { downloadPng, downloadSvg } from './download.js';
import { sanitizeSvg } from './sanitize.js';
import { buildShareUrl, readSharedSource } from './share.js';

/** Panels the editor can show beside the source. */
type Tab = 'diagram' | ScheduleKind;

const TABS: { id: Tab; label: string }[] = [
  { id: 'diagram', label: '図' },
  { id: 'cable', label: 'ケーブル表' },
  { id: 'equipment', label: '機器表' },
  { id: 'adapter', label: '変換部材' },
];

/** Props accepted by {@link KumihimoEditor}. */
export interface KumihimoEditorProps {
  /** Source to start with. Ignored when the URL carries a shared diagram. */
  initialSource?: string;
  /** Theme to start with. */
  initialTheme?: string;
  /** Called whenever the source changes, for hosts that want to persist it. */
  onChange?: (source: string) => void;
  /** Compile options applied to every render, e.g. an import resolver. */
  options?: CompileOptions;
  /** Class applied to the root element. */
  className?: string;
  /** Read a shared diagram out of the URL on mount. Defaults to `true`. */
  readUrl?: boolean;
  /** Base filename used by the download buttons, without extension. */
  filename?: string;
}

/**
 * A live editor for kumihimo diagrams.
 *
 * Designed to be dropped into a documentation site or an internal tool, so it owns its
 * own state and needs nothing from the host but a place to sit.
 *
 * @param props - Initial source and theme, change and option hooks, presentation.
 * @returns The editor.
 */
export function KumihimoEditor({
  initialSource = '',
  initialTheme = 'light',
  onChange,
  options,
  className,
  readUrl = true,
  filename = 'diagram',
}: KumihimoEditorProps): ReactNode {
  const [source, setSource] = useState(initialSource);
  const [theme, setTheme] = useState(initialTheme);
  const [tab, setTab] = useState<Tab>('diagram');
  const [shared, setShared] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const compileOptions = useMemo<CompileOptions>(() => ({ ...options, theme }), [options, theme]);
  const { svg, diagram, diagnostics, pending } = useKumihimo(source, compileOptions);

  // The source may have arrived from someone else's link, which makes this the one place
  // in the project where untrusted input becomes markup on a page. The renderer already
  // guarantees safe output; this is an independent second check at that boundary.
  const safeSvg = useMemo(() => sanitizeSvg(svg), [svg]);

  // A link beats the initial source: someone following a shared URL wants what was shared.
  useEffect(() => {
    if (!readUrl) return;
    let cancelled = false;
    void readSharedSource().then((fromUrl) => {
      if (!cancelled && fromUrl !== undefined) setSource(fromUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [readUrl]);

  const update = useCallback(
    (next: string) => {
      setSource(next);
      onChange?.(next);
    },
    [onChange],
  );

  /** Move the caret to whatever a diagnostic points at, and show it. */
  const jumpTo = useCallback((diagnostic: Diagnostic) => {
    const element = textarea.current;
    if (!element || !diagnostic.span) return;
    element.focus();
    element.setSelectionRange(diagnostic.span.start.offset, diagnostic.span.end.offset);
    // Scrolling by line height is approximate, but it beats leaving the caret off screen.
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 18;
    element.scrollTop = Math.max(0, (diagnostic.span.start.line - 3) * lineHeight);
  }, []);

  const share = useCallback(async () => {
    try {
      const url = await buildShareUrl(source);
      await navigator.clipboard?.writeText(url);
      globalThis.history?.replaceState(null, '', url);
      setShared('URL をコピーしました');
      setTimeout(() => setShared(undefined), 2000);
    } catch {
      setProblem('URL を作成できませんでした');
    }
  }, [source]);

  const savePng = useCallback(async () => {
    try {
      await downloadPng(svg, `${filename}.png`);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  }, [svg, filename]);

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div className={['khm-editor', className].filter(Boolean).join(' ')}>
      <div className="khm-editor__toolbar">
        <label>
          テーマ
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            {Object.keys(THEMES).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <span className="khm-editor__spacer" />

        <span className="khm-editor__status" role="status">
          {pending
            ? '描画中…'
            : errors > 0 || warnings > 0
              ? `${errors} error / ${warnings} warning`
              : '問題なし'}
        </span>

        <button type="button" onClick={() => downloadSvg(svg, `${filename}.svg`)} disabled={!svg}>
          SVG
        </button>
        <button type="button" onClick={() => void savePng()} disabled={!svg}>
          PNG
        </button>
        <button type="button" onClick={() => void share()}>
          URL 共有
        </button>
      </div>

      {shared ? (
        <p className="khm-editor__toast" role="status">
          {shared}
        </p>
      ) : null}
      {problem ? (
        <p className="khm-editor__toast khm-editor__toast--error" role="alert">
          {problem}
        </p>
      ) : null}

      <div className="khm-editor__panes">
        <textarea
          ref={textarea}
          className="khm-editor__source"
          value={source}
          spellCheck={false}
          onChange={(event) => update(event.target.value)}
          aria-label="kumihimo ソース"
        />

        <div className="khm-editor__output">
          <div className="khm-editor__tabs" role="tablist">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={tab === entry.id ? 'is-active' : undefined}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="khm-editor__panel" role="tabpanel">
            {tab === 'diagram' ? (
              // Generated by this library from the source in the box above; every text
              // value in it is escaped by the renderer before it reaches here.
              <div className="khm-editor__preview" dangerouslySetInnerHTML={{ __html: safeSvg }} />
            ) : (
              <ScheduleTable diagram={diagram} kind={tab} />
            )}
          </div>
        </div>
      </div>

      <DiagnosticList diagnostics={diagnostics} onSelect={jumpTo} />
    </div>
  );
}
