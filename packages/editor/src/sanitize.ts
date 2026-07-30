/**
 * A final gate on markup before it is inserted into the page.
 *
 * The renderer already guarantees its output is safe: every text value is escaped and
 * every colour is validated before it reaches an attribute. This exists because the
 * editor is the one place where a diagram can arrive from a stranger — a shared URL
 * carries someone else's source — and a second, independent check at that boundary costs
 * a single pass over a string.
 *
 * It is deliberately an allowlist. A denylist of dangerous attributes is a list you
 * discover you got wrong.
 */

/** Elements the renderer is able to emit. Anything else is not ours and does not belong. */
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'rect',
  'circle',
  'path',
  'polyline',
  'text',
]);

/** Attributes the renderer is able to emit. */
const ALLOWED_ATTRIBUTES = new Set([
  'xmlns',
  'width',
  'height',
  'viewBox',
  'transform',
  'x',
  'y',
  'cx',
  'cy',
  'r',
  'rx',
  'd',
  'points',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linejoin',
  'stroke-linecap',
  'stroke-opacity',
  'font-size',
  'font-weight',
  'font-family',
  'text-anchor',
  'id',
  'class',
  'marker-start',
  'marker-end',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'orient',
]);

/**
 * Strip anything from an SVG document that the renderer could not have produced.
 *
 * @param svg - Markup to clean.
 * @returns The same markup with unknown elements and attributes removed.
 */
export function sanitizeSvg(svg: string): string {
  return svg.replace(
    /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_, slash, tag, rest) => {
      const name = String(tag);
      if (!ALLOWED_ELEMENTS.has(name)) return '';
      if (slash) return `</${name}>`;

      const attributes = String(rest).replace(
        /([a-zA-Z][\w:-]*)\s*=\s*("[^"]*"|'[^']*')/g,
        (whole: string, key: string) => (ALLOWED_ATTRIBUTES.has(key) ? whole : ''),
      );

      const selfClosing = /\/\s*$/.test(String(rest)) ? '/' : '';
      return `<${name}${attributes.replace(/\/\s*$/, '')}${selfClosing}>`;
    },
  );
}
