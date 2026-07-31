/**
 * Recursive-descent parser for the kumihimo DSL.
 *
 * Recovery is per statement: anything the parser cannot make sense of becomes a
 * `parse-error` diagnostic and the parser skips to the next statement separator. A single
 * bad line therefore costs one statement, not the rest of the file — which is what keeps
 * the live editor drawing while the author is mid-keystroke.
 */

import type {
  ArrowKind,
  AttrEntry,
  CompatDecl,
  ConnectionStmt,
  DeviceDecl,
  DiagramDecl,
  Document,
  GroupDecl,
  Literal,
  MetaEntry,
  OptionEntry,
  PortDecl,
  PortDirection,
  PortRef,
  PortSpecItem,
  ModelDecl,
  SignalDecl,
  Statement,
  UseDecl,
} from './ast.js';
import type { Diagnostic, SourceSpan } from './diagnostics.js';
import { DiagnosticBag } from './diagnostics.js';
import type { Token, TokenType } from './lexer.js';
import { tokenize } from './lexer.js';

/** What {@link parse} returns. */
export interface ParseResult {
  /** The syntax tree. Always present, even when diagnostics were reported. */
  document: Document;
  /** Everything the lexer and parser had to say. */
  diagnostics: readonly Diagnostic[];
}

/** Thrown internally to unwind to the statement-recovery point. Never escapes {@link parse}. */
class RecoverError extends Error {}

class Parser {
  readonly #tokens: Token[];
  readonly #bag: DiagnosticBag;
  #index = 0;

  constructor(tokens: Token[], bag: DiagnosticBag) {
    this.#tokens = tokens;
    this.#bag = bag;
  }

  #peek(ahead = 0): Token {
    return this.#tokens[Math.min(this.#index + ahead, this.#tokens.length - 1)]!;
  }

  #at(type: TokenType, value?: string): boolean {
    const token = this.#peek();
    return token.type === type && (value === undefined || token.value === value);
  }

  #next(): Token {
    const token = this.#peek();
    if (token.type !== 'eof') this.#index += 1;
    return token;
  }

  #accept(type: TokenType, value?: string): Token | undefined {
    return this.#at(type, value) ? this.#next() : undefined;
  }

  #fail(message: string, span?: SourceSpan): never {
    this.#bag.report('parse-error', message, span ?? this.#peek().span);
    throw new RecoverError();
  }

  #expect(type: TokenType, what: string): Token {
    const token = this.#accept(type);
    if (!token) this.#fail(`${what}が必要です`);
    return token;
  }

  /** Skip line breaks and semicolons, which never carry meaning between statements. */
  #skipSeparators(): void {
    while (this.#at('newline') || this.#at('semicolon')) this.#next();
  }

  /** Skip line breaks only, used inside blocks where a statement may wrap. */
  #skipNewlines(): void {
    while (this.#at('newline')) this.#next();
  }

  #recover(): void {
    while (!this.#at('eof') && !this.#at('newline') && !this.#at('semicolon')) {
      // A closing brace belongs to the enclosing block, so stop before consuming it.
      if (this.#at('rbrace')) return;
      this.#next();
    }
  }

  #literal(): Literal {
    const token = this.#peek();
    if (token.type === 'string' || token.type === 'number' || token.type === 'ident') {
      this.#next();
      return { kind: token.type, value: token.value, span: token.span };
    }
    if (token.type === 'measure') {
      this.#next();
      return { kind: 'ident', value: token.value, span: token.span };
    }
    this.#fail('値が必要です');
  }

  #span(start: Token): SourceSpan {
    return {
      start: start.span.start,
      end: this.#tokens[this.#index - 1]?.span.end ?? start.span.end,
    };
  }

  // ── blocks ────────────────────────────────────────────────────────────────

  #optionBlock(): OptionEntry[] {
    const entries: OptionEntry[] = [];
    if (!this.#accept('lbrace')) return entries;
    this.#skipSeparators();
    while (!this.#at('rbrace') && !this.#at('eof')) {
      const key = this.#expect('ident', 'オプション名');
      this.#expect('colon', '`:`');
      const value = this.#literal();
      entries.push({ key: key.value, value, span: this.#span(key) });
      this.#skipSeparators();
      this.#accept('comma');
      this.#skipSeparators();
    }
    this.#expect('rbrace', '`}`');
    return entries;
  }

  #attrList(): AttrEntry[] {
    const entries: AttrEntry[] = [];
    if (!this.#accept('lbracket')) return entries;
    this.#skipNewlines();
    while (!this.#at('rbracket') && !this.#at('eof')) {
      const key = this.#expect('ident', '属性名');
      this.#expect('equals', '`=`');
      const value = this.#literal();
      entries.push({ key: key.value, value, span: this.#span(key) });
      this.#skipNewlines();
      this.#accept('comma');
      this.#skipNewlines();
    }
    this.#expect('rbracket', '`]`');
    return entries;
  }

  // ── declarations ──────────────────────────────────────────────────────────

  #diagram(): DiagramDecl {
    const start = this.#next(); // `diagram`
    const title = this.#accept('string');
    const options = this.#optionBlock();
    const node: DiagramDecl = { type: 'diagram', options, span: this.#span(start) };
    if (title) node.title = title.value;
    return node;
  }

  #signal(): SignalDecl {
    const start = this.#next(); // `signal`
    const name = this.#expect('ident', '信号種別名');
    let category: string | undefined;
    if (this.#accept('colon')) category = this.#expect('ident', 'カテゴリ名').value;
    const options = this.#optionBlock();
    const node: SignalDecl = { type: 'signal', name: name.value, options, span: this.#span(start) };
    if (category !== undefined) node.category = category;
    return node;
  }

  #compat(): CompatDecl {
    const start = this.#next(); // `compat`
    const from = this.#expect('ident', '信号種別名');
    if (!this.#accept('arrow')) this.#fail('`->` が必要です');
    const to = this.#expect('ident', '信号種別名');
    this.#expect('colon', '`:`');
    const verdict = this.#expect('ident', '判定 (ok / lossy / incompatible)');
    const reason = this.#accept('string');
    const attrs = this.#attrList();
    const node: CompatDecl = {
      type: 'compat',
      from: from.value,
      to: to.value,
      verdict: verdict.value,
      attrs,
      span: this.#span(start),
    };
    if (reason) node.reason = reason.value;
    return node;
  }

  #portSpecItem(): PortSpecItem {
    const token = this.#next();

    if (token.type === 'number') {
      if (this.#accept('range')) {
        const to = this.#expect('number', '範囲の終端');
        return {
          kind: 'range',
          from: Number(token.value),
          to: Number(to.value),
          span: this.#span(token),
        };
      }
      return { kind: 'name', value: token.value, span: token.span };
    }

    if (token.type === 'ident') {
      if (this.#accept('lbracket')) {
        const from = this.#expect('number', '範囲の始端');
        this.#expect('range', '`..`');
        const to = this.#expect('number', '範囲の終端');
        this.#expect('rbracket', '`]`');
        return {
          kind: 'template',
          prefix: token.value,
          from: Number(from.value),
          to: Number(to.value),
          span: this.#span(token),
        };
      }
      return { kind: 'name', value: token.value, span: token.span };
    }

    this.#fail('ポート名が必要です', token.span);
  }

  #portDecl(): PortDecl {
    const start = this.#next(); // `in` / `out` / `io`
    const spec: PortSpecItem[] = [this.#portSpecItem()];
    while (this.#accept('comma')) {
      this.#skipNewlines();
      spec.push(this.#portSpecItem());
    }
    // `xlr | trs`: one connector, more than one thing it takes. The first is what the port
    // is drawn as, so the order the author wrote them in is kept.
    const signals: string[] = [];
    if (this.#accept('colon')) {
      signals.push(this.#expect('ident', '信号種別名').value);
      while (this.#accept('pipe')) {
        this.#skipNewlines();
        signals.push(this.#expect('ident', '信号種別名').value);
      }
    }

    const node: PortDecl = {
      type: 'port',
      direction: start.value as PortDirection,
      spec,
      span: this.#span(start),
    };
    if (signals.length > 0) node.signals = signals;
    return node;
  }

  /**
   * `gap`, or `gap <n>` for n steps at once.
   *
   * A bare `gap` is one step. `gap 0` and a negative count are rejected rather than
   * quietly ignored: they read as an intention the drawing cannot carry out.
   */
  #gap(): number {
    this.#next(); // `gap`
    if (!this.#at('number')) return 1;

    const token = this.#next();
    const count = Number(token.value);
    if (!Number.isFinite(count) || count < 1) {
      this.#fail('`gap` の数は 1 以上が必要です', token.span);
    }
    return count;
  }

  #meta(): MetaEntry {
    const start = this.#next(); // `@`
    const key = this.#expect('ident', 'メタ情報のキー');
    const value = this.#literal();
    return { key: key.value, value, span: this.#span(start) };
  }

  /** Shared body parser for `device` and `model`, which declare the same things. */
  #equipment(keyword: 'device' | 'model'): DeviceDecl | ModelDecl {
    const start = this.#next(); // `device` or `model`
    const id = this.#expect('ident', keyword === 'device' ? '機器 id' : 'モデル id');

    let model: string | undefined;
    if (keyword === 'device' && this.#at('ident', 'from')) {
      this.#next();
      model = this.#expect('ident', 'モデル id').value;
    }

    const label = this.#accept('string');
    let kind: string | undefined;
    if (this.#at('ident', 'as')) {
      this.#next();
      kind = this.#expect('ident', '機器種別').value;
    }

    const ports: PortDecl[] = [];
    const meta: MetaEntry[] = [];
    // `gap` describes the space above whatever is declared next, so it is held here until
    // that declaration arrives. A `gap` with nothing after it stays pending and is
    // dropped: in a model it may well stop being last, once a device adds ports below it.
    let pendingGap = 0;
    if (this.#accept('lbrace')) {
      this.#skipSeparators();
      while (!this.#at('rbrace') && !this.#at('eof')) {
        try {
          if (this.#at('ident', 'in') || this.#at('ident', 'out') || this.#at('ident', 'io')) {
            const decl = this.#portDecl();
            if (pendingGap > 0) {
              decl.gapBefore = pendingGap;
              pendingGap = 0;
            }
            ports.push(decl);
          } else if (this.#at('ident', 'gap')) {
            pendingGap += this.#gap();
          } else if (this.#at('at')) {
            meta.push(this.#meta());
          } else {
            this.#fail('`in` / `out` / `io` / `gap` / `@キー` のいずれかが必要です');
          }
        } catch (error) {
          if (!(error instanceof RecoverError)) throw error;
          this.#recover();
        }
        this.#skipSeparators();
      }
      this.#expect('rbrace', '`}`');
    }

    const node = {
      type: keyword,
      id: id.value,
      ports,
      meta,
      span: this.#span(start),
    } as DeviceDecl | ModelDecl;
    if (label) node.label = label.value;
    if (kind !== undefined) node.kind = kind;
    if (model !== undefined && node.type === 'device') node.model = model;
    return node;
  }

  #use(): UseDecl {
    const start = this.#next(); // `use`
    const path = this.#expect('string', '取り込むファイルのパス');
    return { type: 'use', path: path.value, span: this.#span(start) };
  }

  #group(): GroupDecl {
    const start = this.#next(); // `group`
    const id = this.#expect('ident', 'グループ id');
    const label = this.#accept('string');
    const statements: Statement[] = [];
    if (this.#accept('lbrace')) {
      this.#skipSeparators();
      while (!this.#at('rbrace') && !this.#at('eof')) {
        const statement = this.#statement();
        if (statement) statements.push(statement);
        this.#skipSeparators();
      }
      this.#expect('rbrace', '`}`');
    }
    const node: GroupDecl = { type: 'group', id: id.value, statements, span: this.#span(start) };
    if (label) node.label = label.value;
    return node;
  }

  // ── connections ───────────────────────────────────────────────────────────

  #portRef(): PortRef {
    const device = this.#expect('ident', '機器 id');
    const ports: string[] = [];
    if (this.#accept('dot')) {
      if (this.#accept('lparen')) {
        this.#skipNewlines();
        while (!this.#at('rparen') && !this.#at('eof')) {
          const name = this.#peek();
          if (name.type !== 'ident' && name.type !== 'number') this.#fail('ポート名が必要です');
          this.#next();
          ports.push(name.value);
          this.#skipNewlines();
          this.#accept('comma');
          this.#skipNewlines();
        }
        this.#expect('rparen', '`)`');
      } else {
        const name = this.#peek();
        if (name.type !== 'ident' && name.type !== 'number') this.#fail('ポート名が必要です');
        this.#next();
        ports.push(name.value);
      }
    }
    return { device: device.value, ports, span: this.#span(device) };
  }

  #connection(): ConnectionStmt {
    const start = this.#peek();
    const from = this.#portRef();
    const arrow = this.#accept('arrow');
    if (!arrow) this.#fail('`->` / `<->` / `--` のいずれかが必要です');
    const to = this.#portRef();

    let signal: string | undefined;
    let length: string | undefined;
    let label: string | undefined;
    let via: string | undefined;
    let attrs: AttrEntry[] = [];

    if (this.#accept('colon')) signal = this.#expect('ident', '信号種別名').value;

    // Modifiers are order-independent, so loop until nothing more applies.
    for (;;) {
      if (this.#at('measure')) {
        length = this.#next().value;
        continue;
      }
      if (this.#at('string')) {
        label = this.#next().value;
        continue;
      }
      if (this.#at('ident', 'via')) {
        this.#next();
        via = this.#expect('string', '変換部材名').value;
        continue;
      }
      if (this.#at('lbracket')) {
        attrs = this.#attrList();
        continue;
      }
      break;
    }

    const node: ConnectionStmt = {
      type: 'connection',
      from,
      to,
      arrow: arrow.value as ArrowKind,
      attrs,
      span: this.#span(start),
    };
    if (signal !== undefined) node.signal = signal;
    if (length !== undefined) node.length = length;
    if (label !== undefined) node.label = label;
    if (via !== undefined) node.via = via;
    return node;
  }

  // ── dispatch ──────────────────────────────────────────────────────────────

  #statement(): Statement | undefined {
    try {
      if (this.#at('ident', 'diagram')) return this.#diagram();
      if (this.#at('ident', 'signal')) return this.#signal();
      if (this.#at('ident', 'compat')) return this.#compat();
      if (this.#at('ident', 'device')) return this.#equipment('device');
      if (this.#at('ident', 'model')) return this.#equipment('model');
      if (this.#at('ident', 'use')) return this.#use();
      if (this.#at('ident', 'group')) return this.#group();
      if (this.#at('ident')) return this.#connection();
      this.#fail('文の先頭が解釈できません');
    } catch (error) {
      if (!(error instanceof RecoverError)) throw error;
      this.#recover();
      return undefined;
    }
  }

  parse(): Document {
    const start = this.#peek();
    const statements: Statement[] = [];
    this.#skipSeparators();
    while (!this.#at('eof')) {
      const statement = this.#statement();
      if (statement) statements.push(statement);
      this.#skipSeparators();
    }
    return { type: 'document', statements, span: this.#span(start) };
  }
}

/**
 * Parse kumihimo source into a syntax tree.
 *
 * Never throws. A malformed statement yields a `parse-error` diagnostic and is dropped
 * from the tree; every other statement still parses.
 *
 * @param source - The `.khm` text to parse.
 * @returns The document and any diagnostics raised while producing it.
 */
export function parse(source: string): ParseResult {
  const bag = new DiagnosticBag();
  const tokens = tokenize(source);

  for (const token of tokens) {
    if (token.type === 'invalid') {
      bag.report('parse-error', `解釈できない字句: ${token.value}`, token.span);
    }
  }

  const document = new Parser(
    tokens.filter((t) => t.type !== 'invalid'),
    bag,
  ).parse();

  return { document, diagnostics: bag.all };
}
