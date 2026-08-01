/**
 * Public API of `@love-rox/kumihimo-core`.
 *
 * kumihimo turns a `.khm` source file describing AV wiring into a validated model and an
 * SVG signal flow diagram (系統図).
 */

export type { Locale, Localised, MessageKey, MessageParams } from './messages.js';
export { DEFAULT_LOCALE, LOCALES, MESSAGES, formatMessage, localise } from './messages.js';

export type { SignalCategory, LineStyle, SignalType, SignalRegistry } from './signals.js';
export {
  BUILTIN_SIGNALS,
  CABLE_COLORS,
  CATEGORY_COLORS,
  CATEGORY_STYLES,
  createSignalRegistry,
  lookupSignal,
  resolveCableColor,
} from './signals.js';

export type {
  CompatibilityVerdict,
  CompatibilityResult,
  CompatibilityRule,
  CompatibilityOptions,
  ConnectorConfusion,
  PassiveAdapter,
  LossyPair,
} from './compatibility.js';
export {
  INTERCHANGEABLE_GROUPS,
  CONNECTOR_CONFUSIONS,
  PASSIVE_ADAPTERS,
  LOSSY_PAIRS,
  checkCompatibility,
} from './compatibility.js';

export type {
  Position,
  SourceSpan,
  Severity,
  DiagnosticCode,
  Diagnostic,
  SeverityConfig,
} from './diagnostics.js';
export { DEFAULT_SEVERITIES, DiagnosticBag } from './diagnostics.js';

export type { TokenType, Token } from './lexer.js';
export { LENGTH_UNITS, tokenize } from './lexer.js';

export type {
  Node,
  Literal,
  OptionEntry,
  AttrEntry,
  MetaEntry,
  PortSpecItem,
  PortName,
  PortRange,
  PortTemplate,
  PortDirection,
  PortDecl,
  DeviceDecl,
  AdapterDecl,
  GroupDecl,
  DiagramDecl,
  SignalDecl,
  CompatDecl,
  ModelDecl,
  UseDecl,
  PortRef,
  ArrowKind,
  ConnectionStmt,
  Statement,
  Document,
} from './ast.js';

export type { ResolvedModule, ModuleResolver, LoadOptions, LoadResult } from './loader.js';
export { loadDocument } from './loader.js';

export type { ParseOptions, ParseResult } from './parser.js';
export { parse } from './parser.js';

export type { Port, Device, Group, LinkEnd, Link, FlowDirection, Diagram } from './model.js';
export { DEVICE_KINDS, findDevice, findPort } from './model.js';

export type { BuildResult, BuildOptions } from './build.js';
export { buildModel } from './build.js';

export type {
  Rect,
  Point,
  PortSide,
  PortLayout,
  DeviceLayout,
  GroupLayout,
  EdgeLayout,
  DiagramLayout,
  LayoutOptions,
} from './layout.js';
export { estimateTextWidth, layoutDiagram } from './layout.js';

export type { RenderOptions } from './render.js';
export { linkStroke, renderSvg, renderDiagram } from './render.js';

export type { StrokeSpec, Theme } from './theme.js';
export { THEMES, DEFAULT_THEME, lookupTheme, strokeFor } from './theme.js';

export type {
  CableRow,
  WirelessRow,
  EquipmentRow,
  AdapterRow,
  ScheduleKind,
  ScheduleColumn,
  ScheduleDefinition,
  ReadableSheet,
} from './schedule.js';
export {
  SCHEDULES,
  SCHEDULE_KINDS,
  cableSchedule,
  wirelessSchedule,
  equipmentSchedule,
  adapterSchedule,
  formatCell,
  readableSchedules,
  toTsv,
} from './schedule.js';

export type { DrawioOptions } from './export/drawio.js';
export { exportDrawio, toDrawio } from './export/drawio.js';

export type { FormatOptions } from './format.js';
export { formatSource } from './format.js';

export type { CompileOptions, CompileResult } from './compile.js';
export { compile } from './compile.js';
