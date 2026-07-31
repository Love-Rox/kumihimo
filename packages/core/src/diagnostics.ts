/**
 * Diagnostics shared by the lexer, parser, validator and renderer.
 *
 * kumihimo never throws on bad input. Every stage collects diagnostics and returns a
 * best-effort result alongside them, so the live editor can keep drawing the last
 * usable diagram while the author is mid-keystroke.
 */

import type { Locale, MessageKey, MessageParams } from './messages.js';
import { DEFAULT_LOCALE, formatMessage } from './messages.js';

/** A single point in a source file. */
export interface Position {
  /** Zero-based offset in UTF-16 code units from the start of the file. */
  offset: number;
  /** One-based line number. */
  line: number;
  /** One-based column number. */
  column: number;
}

/** A half-open range of source text, `start` inclusive and `end` exclusive. */
export interface SourceSpan {
  /** First character of the range. */
  start: Position;
  /** One past the last character of the range. */
  end: Position;
}

/**
 * How loudly a diagnostic is reported.
 *
 * `off` never reaches the caller; it exists so a rule can be disabled by configuration.
 */
export type Severity = 'error' | 'warning' | 'info' | 'off';

/**
 * Stable identifiers for everything kumihimo can complain about.
 *
 * Codes are part of the public API — they are what users put in configuration to
 * silence or escalate a rule, so renaming one is a breaking change.
 */
export type DiagnosticCode =
  /** Syntax the parser could not make sense of. */
  | 'parse-error'
  /** A device was referenced by a connection but never declared. */
  | 'implicit-device'
  /** A port was referenced by a connection but never declared on its device. */
  | 'implicit-port'
  /** The two ends of a link disagree about what signal travels along it. */
  | 'signal-mismatch'
  /** A passive adapter is needed but the link does not declare one with `via`. */
  | 'adapter-required'
  /** The link declares `via`, but no cable can bridge this pairing. */
  | 'adapter-insufficient'
  /** A link joins two outputs or two inputs. */
  | 'direction-mismatch'
  /** The same pair of ports is wired more than once. */
  | 'duplicate-connection'
  /** More than one source feeds a single input port. */
  | 'port-overbooked'
  /** A link names a signal type that is not registered. */
  | 'unknown-signal'
  /** A declared port is not wired to anything. */
  | 'unconnected-port'
  /** Two devices share an id. */
  | 'duplicate-id'
  /** A port specification could not be expanded, e.g. a reversed range. */
  | 'invalid-port-spec'
  /** A device names a kind kumihimo does not know how to draw. */
  | 'unknown-device-kind'
  /** A declaration is well-formed but its value is not one kumihimo accepts. */
  | 'invalid-value'
  /** A `use` names a file the resolver could not find. */
  | 'unresolved-import'
  /** A device names a model that no loaded library declares. */
  | 'unknown-model'
  /** An imported file held devices or connections, which `use` does not bring in. */
  | 'ignored-in-import';

/** Something kumihimo wants to tell the author about their diagram. */
export interface Diagnostic {
  /** Stable rule identifier. */
  code: DiagnosticCode;
  /** How loudly to report it. */
  severity: Severity;
  /** Human readable, one line, no trailing period, in the locale the compile was given. */
  message: string;
  /**
   * Which sentence this is, before a language was chosen.
   *
   * Carried alongside the rendered text so a caller can say it again in another language
   * without compiling the diagram twice — which is what an editor has to do when its
   * display language is not the one the build used.
   */
  key: MessageKey;
  /** The values that were substituted into it. */
  params: MessageParams;
  /** Where in the source it applies, when the stage knows. */
  span?: SourceSpan;
}

/** Severity assigned to each rule when the author has not configured otherwise. */
export const DEFAULT_SEVERITIES: Readonly<Record<DiagnosticCode, Severity>> = {
  'parse-error': 'error',
  'implicit-device': 'warning',
  'implicit-port': 'warning',
  'signal-mismatch': 'warning',
  'adapter-required': 'warning',
  'adapter-insufficient': 'error',
  'direction-mismatch': 'error',
  'duplicate-connection': 'warning',
  'port-overbooked': 'error',
  'unknown-signal': 'error',
  'unconnected-port': 'off',
  'duplicate-id': 'error',
  'invalid-port-spec': 'error',
  'unknown-device-kind': 'warning',
  'invalid-value': 'error',
  'unresolved-import': 'error',
  'unknown-model': 'error',
  'ignored-in-import': 'warning',
};

/** Per-rule severity overrides supplied by the author. */
export type SeverityConfig = Partial<Record<DiagnosticCode, Severity>>;

/**
 * Collects diagnostics during a compile, applying severity configuration as it goes.
 *
 * Rules configured to `off` are dropped at {@link DiagnosticBag.report} time rather than
 * filtered later, so callers never have to think about them.
 */
export class DiagnosticBag {
  readonly #diagnostics: Diagnostic[] = [];
  readonly #severities: Readonly<Record<DiagnosticCode, Severity>>;
  readonly #locale: Locale;

  /**
   * @param config - Per-rule severity overrides layered over {@link DEFAULT_SEVERITIES}.
   * @param locale - Language to render messages in.
   */
  constructor(config: SeverityConfig = {}, locale: Locale = DEFAULT_LOCALE) {
    this.#severities = { ...DEFAULT_SEVERITIES, ...config };
    this.#locale = locale;
  }

  /**
   * Record a diagnostic, unless its rule is configured `off`.
   *
   * @param code - Which rule fired.
   * @param key - Which sentence to say.
   * @param params - Values for the sentence's placeholders.
   * @param span - Where in the source it applies, if known.
   */
  report(
    code: DiagnosticCode,
    key: MessageKey,
    params: MessageParams = {},
    span?: SourceSpan,
  ): void {
    const severity = this.#severities[code];
    if (severity === 'off') return;

    const message = formatMessage(key, params, this.#locale);
    this.#diagnostics.push(
      span
        ? { code, severity, message, key, params, span }
        : { code, severity, message, key, params },
    );
  }

  /**
   * Take in a diagnostic another stage already produced.
   *
   * Used where one compile forwards another's findings — an imported file's, say. Reporting
   * it again from its message would throw away the key and the values it was built from,
   * and with them the ability to say it in another language later.
   *
   * @param diagnostic - The finding to adopt, as it already stands.
   */
  adopt(diagnostic: Diagnostic): void {
    if (this.#severities[diagnostic.code] === 'off') return;
    this.#diagnostics.push(diagnostic);
  }

  /** Every diagnostic recorded so far, in the order reported. */
  get all(): readonly Diagnostic[] {
    return this.#diagnostics;
  }

  /** Whether any recorded diagnostic is an error. */
  get hasErrors(): boolean {
    return this.#diagnostics.some((d) => d.severity === 'error');
  }
}
