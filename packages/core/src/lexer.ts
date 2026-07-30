/**
 * Tokeniser for the kumihimo DSL.
 *
 * Like every other stage, it never throws: unrecognised characters become `invalid`
 * tokens carrying their span, and the parser turns those into diagnostics. A half-typed
 * file must still produce a token stream the parser can walk.
 */

import type { Position, SourceSpan } from './diagnostics.js';

/** Kind of a lexical token. */
export type TokenType =
  /** A bare word: device id, port name, signal name, keyword. */
  | 'ident'
  /** An integer or decimal literal. */
  | 'number'
  /** A number immediately followed by a length unit, e.g. `10m`. */
  | 'measure'
  /** A double-quoted string, already unescaped. */
  | 'string'
  /** `->`, `<->` or `--`. */
  | 'arrow'
  /** `..` between the bounds of a port range. */
  | 'range'
  /** `{` */
  | 'lbrace'
  /** `}` */
  | 'rbrace'
  /** `(` */
  | 'lparen'
  /** `)` */
  | 'rparen'
  /** `[` */
  | 'lbracket'
  /** `]` */
  | 'rbracket'
  /** `:` */
  | 'colon'
  /** `,` */
  | 'comma'
  /** `.` */
  | 'dot'
  /** `;`, an explicit statement separator. */
  | 'semicolon'
  /** `@`, introducing device metadata. */
  | 'at'
  /** `=` inside an attribute list. */
  | 'equals'
  /** A line break, which separates statements. */
  | 'newline'
  /** A character the lexer does not recognise. */
  | 'invalid'
  /** End of input. */
  | 'eof';

/** One lexical token together with where it came from. */
export interface Token {
  /** What kind of token this is. */
  type: TokenType;
  /**
   * The token's text.
   *
   * For `string` this is the decoded content without quotes; for everything else it is
   * the source text as written.
   */
  value: string;
  /** Where the token sits in the source. */
  span: SourceSpan;
}

/** Length units accepted on a {@link Token} of type `measure`. */
export const LENGTH_UNITS: readonly string[] = ['mm', 'cm', 'm', 'in', 'ft'];

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenType>> = {
  '{': 'lbrace',
  '}': 'rbrace',
  '(': 'lparen',
  ')': 'rparen',
  '[': 'lbracket',
  ']': 'rbracket',
  ':': 'colon',
  ',': 'comma',
  '.': 'dot',
  ';': 'semicolon',
  '@': 'at',
  '=': 'equals',
};

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Whether a character may appear in an identifier.
 *
 * Non-ASCII is allowed so that device ids can be written in Japanese, which matters when
 * the ids double as the labels on a drawing.
 */
function isIdentChar(ch: string): boolean {
  if (ch >= 'a' && ch <= 'z') return true;
  if (ch >= 'A' && ch <= 'Z') return true;
  if (isDigit(ch)) return true;
  if (ch === '_') return true;
  return ch.charCodeAt(0) > 127 && !/\s/.test(ch);
}

/**
 * Split kumihimo source into tokens.
 *
 * Whitespace other than line breaks is dropped, and `#` comments run to end of line.
 * Consecutive line breaks collapse into a single `newline` token so blank lines between
 * statements cost the parser nothing.
 *
 * @param source - The `.khm` text to scan.
 * @returns The token stream, always terminated by a single `eof` token.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;

  const here = (): Position => ({ offset, line, column });

  const advance = (count = 1): void => {
    for (let i = 0; i < count; i += 1) {
      if (source[offset] === '\n') {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      offset += 1;
    }
  };

  const push = (type: TokenType, value: string, start: Position): void => {
    tokens.push({ type, value, span: { start, end: here() } });
  };

  while (offset < source.length) {
    const ch = source[offset]!;

    // Line breaks separate statements; runs of them collapse into one token.
    if (ch === '\n' || ch === '\r') {
      const start = here();
      while (offset < source.length && /[\r\n\s]/.test(source[offset]!)) {
        advance();
      }
      const last = tokens[tokens.length - 1];
      if (last && last.type !== 'newline') push('newline', '\n', start);
      continue;
    }

    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Comments run to end of line. The line break itself is left for the next pass so a
    // trailing comment still terminates its statement.
    if (ch === '#') {
      while (offset < source.length && source[offset] !== '\n') advance();
      continue;
    }

    const start = here();

    // Arrows. `<->` and `--` are matched before `-` can start anything else.
    if (ch === '<' && source.startsWith('<->', offset)) {
      advance(3);
      push('arrow', '<->', start);
      continue;
    }
    if (ch === '-' && source.startsWith('->', offset)) {
      advance(2);
      push('arrow', '->', start);
      continue;
    }
    if (ch === '-' && source.startsWith('--', offset)) {
      advance(2);
      push('arrow', '--', start);
      continue;
    }

    if (ch === '.' && source.startsWith('..', offset)) {
      advance(2);
      push('range', '..', start);
      continue;
    }

    if (ch === '"') {
      advance();
      let value = '';
      while (offset < source.length && source[offset] !== '"') {
        if (source[offset] === '\\' && offset + 1 < source.length) {
          const next = source[offset + 1]!;
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          advance(2);
          continue;
        }
        if (source[offset] === '\n') break; // unterminated; stop at the line end
        value += source[offset];
        advance();
      }
      if (source[offset] === '"') {
        advance();
        push('string', value, start);
      } else {
        push('invalid', `"${value}`, start);
      }
      continue;
    }

    if (isDigit(ch)) {
      let raw = '';
      while (offset < source.length && isDigit(source[offset]!)) {
        raw += source[offset];
        advance();
      }
      // A decimal point only continues the number when a digit follows, so `1..4`
      // still lexes as number, range, number.
      if (source[offset] === '.' && isDigit(source[offset + 1] ?? '')) {
        raw += '.';
        advance();
        while (offset < source.length && isDigit(source[offset]!)) {
          raw += source[offset];
          advance();
        }
      }
      // A unit glued to the number makes it a cable length.
      let unit = '';
      let probe = offset;
      while (probe < source.length && /[a-zA-Z]/.test(source[probe]!)) {
        unit += source[probe];
        probe += 1;
      }
      if (unit && LENGTH_UNITS.includes(unit.toLowerCase())) {
        advance(unit.length);
        push('measure', raw + unit, start);
      } else {
        push('number', raw, start);
      }
      continue;
    }

    if (isIdentChar(ch)) {
      let value = '';
      while (offset < source.length) {
        const c = source[offset]!;
        if (isIdentChar(c)) {
          value += c;
          advance();
          continue;
        }
        // A hyphen belongs to the identifier only when it is not starting an arrow,
        // so `cam-1->sw` reads as `cam-1`, `->`, `sw`.
        if (c === '-' && source[offset + 1] !== '>' && source[offset + 1] !== '-') {
          value += c;
          advance();
          continue;
        }
        break;
      }
      push('ident', value, start);
      continue;
    }

    const single = SINGLE_CHAR_TOKENS[ch];
    if (single) {
      advance();
      push(single, ch, start);
      continue;
    }

    advance();
    push('invalid', ch, start);
  }

  tokens.push({ type: 'eof', value: '', span: { start: here(), end: here() } });
  return tokens;
}
