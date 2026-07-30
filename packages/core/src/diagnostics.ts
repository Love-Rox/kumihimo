/**
 * Diagnostics shared by the lexer, parser, validator and renderer.
 *
 * kumihimo never throws on bad input. Every stage collects diagnostics and returns a
 * best-effort result alongside them, so the live editor can keep drawing the last
 * usable diagram while the author is mid-keystroke.
 */

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
  /** Human readable, one line, no trailing period. */
  message: string;
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

  /**
   * @param config - Per-rule severity overrides layered over {@link DEFAULT_SEVERITIES}.
   */
  constructor(config: SeverityConfig = {}) {
    this.#severities = { ...DEFAULT_SEVERITIES, ...config };
  }

  /**
   * Record a diagnostic, unless its rule is configured `off`.
   *
   * @param code - Which rule fired.
   * @param message - Human readable explanation.
   * @param span - Where in the source it applies, if known.
   */
  report(code: DiagnosticCode, message: string, span?: SourceSpan): void {
    const severity = this.#severities[code];
    if (severity === 'off') return;
    this.#diagnostics.push(span ? { code, severity, message, span } : { code, severity, message });
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
