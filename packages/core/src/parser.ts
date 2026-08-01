/**
 * Recursive-descent parser for the kumihimo DSL.
 *
 * Recovery is per statement: anything the parser cannot make sense of becomes a
 * `parse-error` diagnostic and the parser skips to the next statement separator. A single
 * bad line therefore costs one statement, not the rest of the file — which is what keeps
 * the live editor drawing while the author is mid-keystroke.
 */

import type {
  AdapterDecl,
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
import type { Locale, Localised, MessageKey, MessageParams } from './messages.js';
import { DEFAULT_LOCALE, localise } from './messages.js';
import type { Token, TokenType } from './lexer.js';
import { tokenize } from './lexer.js';

/** How to parse. */
export interface ParseOptions {
  /** Language for diagnostic messages. Defaults to English. */
  locale?: Locale;
}

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
  readonly #locale: Locale;
  #index = 0;

  constructor(tokens: Token[], bag: DiagnosticBag, locale: Locale) {
    this.#tokens = tokens;
    this.#bag = bag;
    this.#locale = locale;
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

  #fail(key: MessageKey, params: MessageParams = {}, span?: SourceSpan): never {
    this.#bag.report('parse-error', key, params, span ?? this.#peek().span);
    throw new RecoverError();
  }

  /**
   * Consume a token of the given type, or give up on this statement.
   *
   * @param type - The token type required here.
   * @param what - What to call it in the message. A symbol like \`:\` is written once and
   *   reads the same in any language; a noun needs both.
   */
  #expect(type: TokenType, what: Localised): Token {
    const token = this.#accept(type);
    if (!token) this.#fail('parse.expected', { what: localise(what, this.#locale) });
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
    this.#fail('parse.value');
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
      const key = this.#expect('ident', { en: 'An option name', ja: 'オプション名' });
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
      const key = this.#expect('ident', { en: 'An attribute name', ja: '属性名' });
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
    const name = this.#expect('ident', { en: 'A signal type name', ja: '信号種別名' });
    let category: string | undefined;
    if (this.#accept('colon'))
      category = this.#expect('ident', { en: 'A category name', ja: 'カテゴリ名' }).value;
    const options = this.#optionBlock();
    const node: SignalDecl = { type: 'signal', name: name.value, options, span: this.#span(start) };
    if (category !== undefined) node.category = category;
    return node;
  }

  #compat(): CompatDecl {
    const start = this.#next(); // `compat`
    const from = this.#expect('ident', { en: 'A signal type name', ja: '信号種別名' });
    if (!this.#accept('arrow')) this.#fail('parse.arrow');
    const to = this.#expect('ident', { en: 'A signal type name', ja: '信号種別名' });
    this.#expect('colon', '`:`');
    const verdict = this.#expect('ident', {
      en: 'A verdict (ok / lossy / incompatible)',
      ja: '判定 (ok / lossy / incompatible)',
    });
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
        const to = this.#expect('number', { en: 'The end of the range', ja: '範囲の終端' });
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
        const from = this.#expect('number', { en: 'The start of the range', ja: '範囲の始端' });
        this.#expect('range', '`..`');
        const to = this.#expect('number', { en: 'The end of the range', ja: '範囲の終端' });
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

    this.#fail('parse.port-name', {}, token.span);
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
      signals.push(this.#expect('ident', { en: 'A signal type name', ja: '信号種別名' }).value);
      while (this.#accept('pipe')) {
        this.#skipNewlines();
        signals.push(this.#expect('ident', { en: 'A signal type name', ja: '信号種別名' }).value);
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
      this.#fail('parse.gap-count', {}, token.span);
    }
    return count;
  }

  #meta(): MetaEntry {
    const start = this.#next(); // `@`
    const key = this.#expect('ident', { en: 'A metadata key', ja: 'メタ情報のキー' });
    const value = this.#literal();
    return { key: key.value, value, span: this.#span(start) };
  }

  /**
   * The `{ … }` of anything that declares connectors: a device, a model, an adapter.
   *
   * @returns The ports in declaration order, and the metadata.
   */
  #body(): { ports: PortDecl[]; meta: MetaEntry[] } {
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
            this.#fail('parse.device-body');
          }
        } catch (error) {
          if (!(error instanceof RecoverError)) throw error;
          this.#recover();
        }
        this.#skipSeparators();
      }
      this.#expect('rbrace', '`}`');
    }
    return { ports, meta };
  }

  /**
   * A passive part with named ends.
   *
   * The body is the same as a device's, because the thing being described is the same —
   * connectors, in an order. What differs is everything downstream: which schedule it
   * lands on, and how it is drawn.
   */
  #adapter(): AdapterDecl {
    const start = this.#next(); // `adapter`
    const id = this.#expect('ident', { en: 'An adapter id', ja: '変換部材 id' });
    const label = this.#accept('string');

    // `as cable 5m "C-01"` — the same modifiers a run takes, because they describe the same
    // thing: a cable somebody has to find, measure and label.
    let asCable = false;
    let length: string | undefined;
    let cableLabel: string | undefined;
    if (this.#at('ident', 'as')) {
      this.#next();
      this.#expect('ident', { en: '`cable`', ja: '`cable`' });
      asCable = true;
      for (;;) {
        if (this.#at('measure')) {
          length = this.#next().value;
          continue;
        }
        if (this.#at('string')) {
          cableLabel = this.#next().value;
          continue;
        }
        break;
      }
    }

    const { ports, meta } = this.#body();

    const node: AdapterDecl = {
      type: 'adapter',
      id: id.value,
      ports,
      meta,
      span: this.#span(start),
    };
    if (label) node.label = label.value;
    if (asCable) node.asCable = true;
    if (length !== undefined) node.length = length;
    if (cableLabel !== undefined) node.cableLabel = cableLabel;
    return node;
  }

  /** Shared body parser for `device` and `model`, which declare the same things. */
  #equipment(keyword: 'device' | 'model'): DeviceDecl | ModelDecl {
    const start = this.#next(); // `device` or `model`
    const id = this.#expect(
      'ident',
      keyword === 'device'
        ? { en: 'A device id', ja: '機器 id' }
        : { en: 'A model id', ja: 'モデル id' },
    );

    let model: string | undefined;
    if (keyword === 'device' && this.#at('ident', 'from')) {
      this.#next();
      model = this.#expect('ident', { en: 'A model id', ja: 'モデル id' }).value;
    }

    const label = this.#accept('string');
    let kind: string | undefined;
    if (this.#at('ident', 'as')) {
      this.#next();
      kind = this.#expect('ident', { en: 'A device kind', ja: '機器種別' }).value;
    }

    const { ports, meta } = this.#body();

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
    const path = this.#expect('string', {
      en: 'The path of the file to import',
      ja: '取り込むファイルのパス',
    });
    return { type: 'use', path: path.value, span: this.#span(start) };
  }

  #group(): GroupDecl {
    const start = this.#next(); // `group`
    const id = this.#expect('ident', { en: 'A group id', ja: 'グループ id' });
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
    const device = this.#expect('ident', { en: 'A device id', ja: '機器 id' });
    const ports: string[] = [];
    if (this.#accept('dot')) {
      if (this.#accept('lparen')) {
        this.#skipNewlines();
        while (!this.#at('rparen') && !this.#at('eof')) {
          const name = this.#peek();
          if (name.type !== 'ident' && name.type !== 'number') this.#fail('parse.port-name');
          this.#next();
          ports.push(name.value);
          this.#skipNewlines();
          this.#accept('comma');
          this.#skipNewlines();
        }
        this.#expect('rparen', '`)`');
      } else {
        const name = this.#peek();
        if (name.type !== 'ident' && name.type !== 'number') this.#fail('parse.port-name');
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
    if (!arrow) this.#fail('parse.any-arrow');
    const to = this.#portRef();

    let signal: string | undefined;
    let carrier: string | undefined;
    let length: string | undefined;
    let label: string | undefined;
    let via: string | undefined;
    let attrs: AttrEntry[] = [];

    if (this.#accept('colon')) {
      signal = this.#expect('ident', { en: 'A signal type name', ja: '信号種別名' }).value;
      // `over` binds to the signal rather than sitting with the other modifiers: it says
      // what that signal is riding on, and reads as one phrase.
      if (this.#at('ident', 'over')) {
        this.#next();
        carrier = this.#expect('ident', {
          en: 'A signal type name',
          ja: '信号種別名',
        }).value;
      }
    }

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
        via = this.#expect('string', { en: 'The name of the adapter', ja: '変換部材名' }).value;
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
    if (carrier !== undefined) node.carrier = carrier;
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
      if (this.#at('ident', 'adapter')) return this.#adapter();
      if (this.#at('ident', 'model')) return this.#equipment('model');
      if (this.#at('ident', 'use')) return this.#use();
      if (this.#at('ident', 'group')) return this.#group();
      if (this.#at('ident')) return this.#connection();
      this.#fail('parse.statement');
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
 * @param options - Message language.
 * @returns The document and any diagnostics raised while producing it.
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const bag = new DiagnosticBag({}, options.locale ?? DEFAULT_LOCALE);
  const tokens = tokenize(source);

  for (const token of tokens) {
    if (token.type === 'invalid') {
      bag.report('parse-error', 'parse.token', { token: token.value }, token.span);
    }
  }

  const document = new Parser(
    tokens.filter((t) => t.type !== 'invalid'),
    bag,
    options.locale ?? DEFAULT_LOCALE,
  ).parse();

  return { document, diagnostics: bag.all };
}
