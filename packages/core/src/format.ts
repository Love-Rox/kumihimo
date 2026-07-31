/**
 * Lay a `.khm` file out.
 *
 * Line-oriented rather than a print of the syntax tree. Statements in this language are
 * separated by line breaks, so lines are the unit the author already thinks in — and a
 * tree printer would have to reinvent comment attachment, which is where most formatters
 * lose text. Here a comment stays on the line it was written on, because the line is never
 * taken apart.
 *
 * What it does: indent by brace depth, normalise spacing around punctuation, and align
 * columns down a run of similar lines. That last one is the point. A rack list is read by
 * scanning a column, and columns drift the moment anybody edits a name.
 */

import { tokenize } from './lexer.js';
import type { Token } from './lexer.js';

/** How to lay a file out. */
export interface FormatOptions {
  /** Spaces per level of nesting. Defaults to 2. */
  indent?: number;
  /**
   * Column alignment down runs of similar lines. Defaults to `true`.
   *
   * Off gives one space between everything, which is easier to diff and harder to read.
   */
  align?: boolean;
}

/** A line, taken apart far enough to lay it out again. */
interface Line {
  /** Nesting level this line's content sits at. */
  depth: number;
  /** The statement's tokens, with comment and trailing separator removed. */
  tokens: Token[];
  /** Trailing `#` comment, as written including the `#`. */
  comment?: string;
  /** Whether the line held nothing but whitespace. */
  blank: boolean;
  /** Whether the line held nothing but a comment. */
  commentOnly: boolean;
  /** Alignment group, so only comparable lines are padded to each other. */
  shape: Shape;
  /** The cells to align, when this line has a shape that has any. */
  cells: string[];
  /** Anything after the aligned cells, laid out but not padded. */
  rest: string;
}

/**
 * What a line is, for alignment.
 *
 * Only lines of the same shape, in the same run, are padded to each other. A port
 * declaration and a connection have nothing to line up.
 */
type Shape = 'port' | 'connection' | 'other';

/**
 * Split a line into its statement and its trailing comment.
 *
 * A `#` inside a string is not a comment, which is the only thing that makes this more
 * than an `indexOf`. Cable numbers like `"V-01 #2"` are ordinary enough to matter.
 */
function splitComment(line: string): { code: string; comment?: string } {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && inString) {
      i += 1;
      continue;
    }
    if (ch === '"') inString = !inString;
    else if (ch === '#' && !inString) {
      return { code: line.slice(0, i), comment: line.slice(i).trimEnd() };
    }
  }
  return { code: line };
}

/** Whether a space belongs between two adjacent tokens. */
function spaceBetween(left: Token, right: Token): boolean {
  // `a.B`, `1..8`, `(L, R)` and `@key` are written tight, and reading them apart is worse.
  if (left.type === 'dot' || right.type === 'dot') return false;
  if (left.type === 'range' || right.type === 'range') return false;
  if (left.type === 'at') return false;
  if (right.type === 'comma') return false;
  if (left.type === 'lparen' || right.type === 'rparen') return false;
  if (left.type === 'lbracket' || right.type === 'rbracket') return false;
  if (left.type === 'equals' || right.type === 'equals') return false;
  if (right.type === 'colon') return false;
  if (right.type === 'lparen' && left.type === 'ident') return false;
  return true;
}

/** One token, as it should be written. */
function write(token: Token): string {
  // The lexer decodes strings, so the quotes and any escapes have to go back on.
  if (token.type === 'string') {
    return `"${token.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return token.value;
}

/** Join tokens with canonical spacing. */
function join(tokens: readonly Token[]): string {
  let out = '';
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const previous = tokens[i - 1];
    if (previous && spaceBetween(previous, token)) out += ' ';
    out += write(token);
  }
  return out;
}

/**
 * Which columns a line offers for alignment.
 *
 * A port declaration gives its direction, its names and its type; a connection gives its
 * two ends and its type. Anything else offers nothing, which is why `other` exists rather
 * than a guess at what a `device` header line has in common with the next one.
 */
function shapeOf(tokens: readonly Token[]): { shape: Shape; cells: string[]; rest: string } {
  const first = tokens[0];

  if (first?.type === 'ident' && ['in', 'out', 'io'].includes(first.value)) {
    const colon = tokens.findIndex((t) => t.type === 'colon');
    if (colon === -1) {
      return { shape: 'port', cells: [first.value, join(tokens.slice(1))], rest: '' };
    }
    return {
      shape: 'port',
      cells: [first.value, join(tokens.slice(1, colon))],
      rest: `: ${join(tokens.slice(colon + 1))}`,
    };
  }

  const arrow = tokens.findIndex((t) => t.type === 'arrow');
  if (arrow > 0) {
    const colon = tokens.findIndex((t) => t.type === 'colon');
    const to = colon === -1 ? tokens.length : colon;
    return {
      shape: 'connection',
      cells: [
        join(tokens.slice(0, arrow)),
        tokens[arrow]!.value,
        join(tokens.slice(arrow + 1, to)),
      ],
      rest: colon === -1 ? '' : `: ${join(tokens.slice(colon + 1))}`,
    };
  }

  return { shape: 'other', cells: [], rest: join(tokens) };
}

/** Read the file into lines that know their own depth and shape. */
function read(source: string): Line[] {
  const lines: Line[] = [];
  let depth = 0;

  for (const raw of source.split('\n')) {
    const { code, comment } = splitComment(raw);
    const trimmed = code.trim();

    if (trimmed === '') {
      const line: Line = {
        depth,
        tokens: [],
        blank: comment === undefined,
        commentOnly: comment !== undefined,
        shape: 'other',
        cells: [],
        rest: '',
      };
      if (comment !== undefined) line.comment = comment;
      lines.push(line);
      continue;
    }

    const tokens = tokenize(trimmed).filter(
      (t) => t.type !== 'eof' && t.type !== 'newline' && t.type !== 'semicolon',
    );

    // A closing brace belongs at the level of the thing it closes, not its contents.
    const closesFirst = tokens[0]?.type === 'rbrace';
    const at = closesFirst ? Math.max(0, depth - 1) : depth;

    for (const token of tokens) {
      if (token.type === 'lbrace') depth += 1;
      else if (token.type === 'rbrace') depth = Math.max(0, depth - 1);
    }

    const { shape, cells, rest } = shapeOf(tokens);
    const line: Line = { depth: at, tokens, blank: false, commentOnly: false, shape, cells, rest };
    if (comment !== undefined) line.comment = comment;
    lines.push(line);
  }

  return lines;
}

/** The widest each cell gets in one run of comparable lines. */
function widths(run: readonly Line[]): number[] {
  const out: number[] = [];
  for (const line of run) {
    line.cells.forEach((cell, i) => {
      out[i] = Math.max(out[i] ?? 0, [...cell].length);
    });
  }
  return out;
}

/**
 * Lay out a `.khm` source.
 *
 * Never throws, and never gives up on a file it cannot make sense of: a line whose tokens
 * are unreadable is re-emitted as written, indented. Someone formatting a half-typed file
 * should get their file back, not an error and an empty buffer.
 *
 * @param source - The text to lay out.
 * @param options - Indent width and whether to align columns.
 * @returns The formatted text, ending in a single newline.
 */
export function formatSource(source: string, options: FormatOptions = {}): string {
  const width = options.indent ?? 2;
  const align = options.align ?? true;

  const lines = read(source);
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.blank) {
      // Runs of blank lines collapse to one. More than one says nothing extra, and they
      // accumulate every time two people edit the same block.
      out.push('');
      while (lines[i]?.blank) i += 1;
      continue;
    }

    const pad = ' '.repeat(width * line.depth);

    if (line.commentOnly) {
      out.push(`${pad}${line.comment ?? ''}`);
      i += 1;
      continue;
    }

    // A run is consecutive lines of the same shape at the same depth. A blank line or a
    // different shape ends it, because those are exactly where a reader stops scanning
    // the column.
    const run: Line[] = [];
    let j = i;
    while (j < lines.length) {
      const next = lines[j]!;
      if (next.blank || next.commentOnly) break;
      if (next.shape !== line.shape || next.depth !== line.depth) break;
      run.push(next);
      j += 1;
    }

    const columns = align && line.shape !== 'other' ? widths(run) : [];

    for (const entry of run) {
      const body =
        entry.shape === 'other'
          ? entry.rest
          : entry.cells
              .map((cell, k) => {
                const target = columns[k] ?? [...cell].length;
                const last = k === entry.cells.length - 1;
                // The final cell is not padded when nothing follows it, or every line
                // would carry trailing spaces.
                const padded = last && entry.rest === '' ? cell : cell.padEnd(target);
                return padded;
              })
              .join(' ') + (entry.rest === '' ? '' : ` ${entry.rest}`);

      const text = `${' '.repeat(width * entry.depth)}${body}`;
      out.push(entry.comment === undefined ? text : `${text.trimEnd()}  ${entry.comment}`);
    }

    i = j;
  }

  // One trailing newline, and no blank line at either end.
  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out.at(-1) === '') out.pop();
  return `${out.join('\n')}\n`;
}
