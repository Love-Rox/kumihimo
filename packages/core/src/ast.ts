/**
 * Syntax tree produced by the parser.
 *
 * The AST stays close to what the author wrote — port ranges are still ranges, implicit
 * devices are still absent — so that formatters and editors can round-trip it. Expansion
 * and resolution happen later, when the model is built.
 */

import type { SourceSpan } from './diagnostics.js';

/** Common shape of every syntax node. */
export interface Node {
  /** Where the node sits in the source. */
  span: SourceSpan;
}

/** A literal value usable on the right of an option or attribute. */
export interface Literal extends Node {
  /** How the value was written. */
  kind: 'string' | 'number' | 'ident';
  /** The decoded value. Numbers keep their source text; callers parse as needed. */
  value: string;
}

/** A `key: value` pair inside a `diagram` or `signal` block. */
export interface OptionEntry extends Node {
  /** Option name as written. */
  key: string;
  /** Value assigned to it. */
  value: Literal;
}

/** A `key=value` pair inside a `[…]` attribute list. */
export interface AttrEntry extends Node {
  /** Attribute name as written. */
  key: string;
  /** Value assigned to it. */
  value: Literal;
}

/** An `@key "value"` line inside a device body. */
export interface MetaEntry extends Node {
  /** Metadata key, without the leading `@`. */
  key: string;
  /** Value assigned to it. */
  value: Literal;
}

/** One element of a port specification, before ranges are expanded. */
export type PortSpecItem = PortName | PortRange | PortTemplate;

/** A single literal port name, e.g. `SDI` or `1`. */
export interface PortName extends Node {
  /** Discriminant. */
  kind: 'name';
  /** The name as written. */
  value: string;
}

/** A bare numeric range, e.g. `1..4`. */
export interface PortRange extends Node {
  /** Discriminant. */
  kind: 'range';
  /** First port number, inclusive. */
  from: number;
  /** Last port number, inclusive. */
  to: number;
}

/** A prefixed numeric range, e.g. `CH[1..16]`. */
export interface PortTemplate extends Node {
  /** Discriminant. */
  kind: 'template';
  /** Text placed before each number. */
  prefix: string;
  /** First port number, inclusive. */
  from: number;
  /** Last port number, inclusive. */
  to: number;
}

/** Which way signal flows through a port. */
export type PortDirection = 'in' | 'out' | 'io';

/** An `in` / `out` / `io` line inside a device body. */
export interface PortDecl extends Node {
  /** Discriminant. */
  type: 'port';
  /** Which way signal flows. */
  direction: PortDirection;
  /** The ports declared, still unexpanded. */
  spec: PortSpecItem[];
  /** Signal type carried by these ports, when the author named one. */
  signal?: string;
}

/** A `device` declaration. */
export interface DeviceDecl extends Node {
  /** Discriminant. */
  type: 'device';
  /** Identifier connections refer to. */
  id: string;
  /**
   * Equipment model to inherit ports, kind and metadata from, written as `from <model>`.
   *
   * Anything the device declares itself is layered on top, so a stock model can be used
   * as-is and still be extended for the one unit that has an expansion card fitted.
   */
  model?: string;
  /** Name drawn on the diagram. Defaults to the model's label, then {@link DeviceDecl.id}. */
  label?: string;
  /** Device kind, which picks the shape. Defaults to `generic`. */
  kind?: string;
  /** Ports declared in the body. */
  ports: PortDecl[];
  /** `@key` metadata declared in the body. */
  meta: MetaEntry[];
}

/**
 * A `model` declaration: a reusable piece of equipment, not an instance of one.
 *
 * A model has no place in a diagram until a `device … from` names it. This is what makes
 * an equipment library possible — a mixer's sixteen channels are described once and every
 * drawing that uses that mixer inherits them.
 */
export interface ModelDecl extends Node {
  /** Discriminant. */
  type: 'model';
  /** Identifier devices refer to with `from`. */
  id: string;
  /** Default name drawn on the diagram for devices of this model. */
  label?: string;
  /** Device kind, which picks the shape. */
  kind?: string;
  /** Ports every device of this model has. */
  ports: PortDecl[];
  /** `@key` metadata every device of this model carries. */
  meta: MetaEntry[];
}

/** A `use` declaration pulling in another file's models, signals and compat rules. */
export interface UseDecl extends Node {
  /** Discriminant. */
  type: 'use';
  /** Path as written, resolved by the caller's module resolver. */
  path: string;
}

/** A `group` declaration wrapping other statements. */
export interface GroupDecl extends Node {
  /** Discriminant. */
  type: 'group';
  /** Identifier for the group. */
  id: string;
  /** Name drawn on the frame. Defaults to {@link GroupDecl.id}. */
  label?: string;
  /** Statements nested inside. */
  statements: Statement[];
}

/** A `diagram` declaration carrying document-wide options. */
export interface DiagramDecl extends Node {
  /** Discriminant. */
  type: 'diagram';
  /** Title drawn on the diagram. */
  title?: string;
  /** Options from the block body. */
  options: OptionEntry[];
}

/** A `signal` declaration adding or overriding a signal type. */
export interface SignalDecl extends Node {
  /** Discriminant. */
  type: 'signal';
  /** Name used in the DSL. */
  name: string;
  /** Category it belongs to. Defaults to `generic`. */
  category?: string;
  /** Options from the block body. */
  options: OptionEntry[];
}

/** A `compat` declaration overriding a compatibility verdict. */
export interface CompatDecl extends Node {
  /** Discriminant. */
  type: 'compat';
  /** Signal type on the left. */
  from: string;
  /** Signal type on the right. */
  to: string;
  /** Verdict to force, as written. */
  verdict: string;
  /** Why this site treats it that way. */
  reason?: string;
  /** Extra attributes, e.g. `[symmetric=false]`. */
  attrs: AttrEntry[];
}

/** One end of a connection: a device and the ports on it being wired. */
export interface PortRef extends Node {
  /** Device identifier. */
  device: string;
  /**
   * Ports on that device.
   *
   * Holds more than one entry only for the parenthesised form, `mixer.(L, R)`. Empty when
   * the author named no port at all, which the model builder reports.
   */
  ports: string[];
}

/** How a connection is drawn and what it means. */
export type ArrowKind = '->' | '<->' | '--';

/** A connection statement. */
export interface ConnectionStmt extends Node {
  /** Discriminant. */
  type: 'connection';
  /** Source end. */
  from: PortRef;
  /** Destination end. */
  to: PortRef;
  /** Directionality as written. */
  arrow: ArrowKind;
  /** Signal type, when the author named one. Otherwise inferred from the ports. */
  signal?: string;
  /** Cable length as written, e.g. `10m`. */
  length?: string;
  /** Cable number or name. */
  label?: string;
  /** Passive adapter declared with `via`. */
  via?: string;
  /** Extra attributes from a `[…]` list. */
  attrs: AttrEntry[];
}

/** Anything that can appear at the top level or inside a group. */
export type Statement =
  | DiagramDecl
  | SignalDecl
  | CompatDecl
  | DeviceDecl
  | ModelDecl
  | GroupDecl
  | UseDecl
  | ConnectionStmt;

/** A parsed `.khm` file. */
export interface Document extends Node {
  /** Discriminant. */
  type: 'document';
  /** Statements in source order. */
  statements: Statement[];
}
