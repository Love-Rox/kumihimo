/**
 * Draws a laid-out diagram as standalone SVG.
 *
 * The output carries no external references — no fonts, no scripts, no stylesheets — so
 * the same file works in a browser, in a Markdown preview, and pasted into a document.
 */

import type { DiagramLayout, EdgeLayout, Point } from './layout.js';
import type { Locale } from './messages.js';
import { DEFAULT_LOCALE, localise } from './messages.js';
import { estimateTextWidth, layoutDiagram } from './layout.js';
import type { LayoutOptions } from './layout.js';
import type { Diagram, Link } from './model.js';
import type { StrokeSpec, Theme } from './theme.js';
import { DEFAULT_THEME, lookupTheme, strokeFor } from './theme.js';

/** How to draw the diagram. */
export interface RenderOptions extends LayoutOptions {
  /** Language for the legend's signal names. Defaults to English. */
  locale?: Locale;
  /** Font stack used for every label. */
  fontFamily?: string;
  /** Draw a key of the signal types in use. Defaults to `true`. */
  legend?: boolean;
  /** Mark links whose compatibility check was not clean. Defaults to `true`. */
  highlightProblems?: boolean;
  /**
   * Colour theme name, or a theme object.
   *
   * A `diagram { theme: … }` option in the source takes precedence over this, so a
   * drawing can pin its own appearance while a caller supplies the default.
   */
  theme?: string | Theme;
}

const DEFAULT_FONT =
  "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif";

/**
 * The smallest a label may become before it stops being a label.
 *
 * Eight pixels. Below that a port name is a grey smudge that says a name is there without
 * saying which — worse than a drawing that has to be scrolled, because scrolling is a thing
 * somebody can do about it.
 */
const MIN_LEGIBLE_TEXT = 8;

/**
 * How far a drawing may be scaled down and still be readable.
 *
 * A page that fits a wide diagram into a narrow column does it by scaling, and scaling has no
 * floor of its own: a 924px drawing in a 560px note comes out at 61%, which takes the port
 * names from 10px to 6px. Every surface that embeds a drawing needs the same answer, and it
 * is the renderer that knows it, because the renderer chose the type size.
 *
 * Multiply by the drawing's own width to get the width to stop shrinking at, and let the box
 * around it scroll from there.
 *
 * @param options - The same options the drawing was rendered with, for the font size.
 * @returns A scale in `(0, 1]`.
 */
export function legibleScale(options: Pick<RenderOptions, 'fontSize'> = {}): number {
  // The smallest thing drawn is a port name, three under the base size.
  const smallest = (options.fontSize ?? 13) - 3;
  return Math.min(1, MIN_LEGIBLE_TEXT / smallest);
}

/** Escape text for inclusion in XML character data or an attribute value. */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dashArray(stroke: StrokeSpec, width: number, wireless = false): string {
  // A radio path gets a long, airy dash of its own so it never reads as a cable, whatever
  // line style its signal family would otherwise use.
  if (wireless) return `${width * 5} ${width * 3}`;
  if (stroke.style === 'dashed') return `${width * 3} ${width * 2}`;
  if (stroke.style === 'dotted') return `${width} ${width * 2}`;
  return '';
}

/**
 * A broadcast mark: a point with waves radiating either side.
 *
 * Drawn on wireless links because a dash pattern alone is a weak signal on a busy
 * drawing, and "is this cable or is it over the air" is exactly the question someone
 * reading a rack plan needs answered at a glance.
 */
function wirelessGlyph(at: Point, color: string): string {
  const x = at.x;
  const y = at.y;
  return (
    `<g stroke="${safeColor(color)}" fill="none" stroke-width="1.3" stroke-linecap="round">` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="1.7" fill="${safeColor(color)}" stroke="none"/>` +
    `<path d="M ${n(x - 4)} ${n(y - 3)} a 5 5 0 0 0 0 6"/>` +
    `<path d="M ${n(x + 4)} ${n(y - 3)} a 5 5 0 0 1 0 6"/>` +
    `<path d="M ${n(x - 7.5)} ${n(y - 5.5)} a 9 9 0 0 0 0 11"/>` +
    `<path d="M ${n(x + 7.5)} ${n(y - 5.5)} a 9 9 0 0 1 0 11"/>` +
    `</g>`
  );
}

/** Round to a tenth of a pixel; full float coordinates bloat the file for no gain. */
function n(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

function polyline(points: readonly Point[]): string {
  return points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
}

/**
 * Choose where to hang a cable label.
 *
 * The centre of the longest horizontal run, rather than the midpoint of the whole
 * polyline. Routing is orthogonal, so there is always such a run, and sitting on it keeps
 * the label reading along the cable instead of across a corner.
 */
function labelAnchor(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;

  let best: { a: Point; b: Point; length: number } | undefined;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const horizontal = Math.abs(b.y - a.y) < 1;
    const length = horizontal ? Math.abs(b.x - a.x) : 0;
    if (!best || length > best.length) best = { a, b, length };
  }

  const { a, b } = best!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Nudge labels apart so parallel cables stay readable.
 *
 * Cables that run side by side get labels at the same height, which is exactly where a
 * drawing becomes unreadable. Claimed boxes are remembered and later labels step away
 * until they find clear space.
 */
class LabelPacker {
  readonly #claimed: { x: number; y: number; w: number; h: number }[] = [];

  /**
   * @param obstacles - Regions labels must stay clear of, typically the device boxes.
   *   Without these a label on a short cable between two adjacent boxes lands on top of
   *   one of them.
   */
  constructor(obstacles: readonly { x: number; y: number; width: number; height: number }[] = []) {
    for (const o of obstacles) {
      this.#claimed.push({ x: o.x, y: o.y, w: o.width, h: o.height });
    }
  }

  /**
   * Find a free position near the requested one.
   *
   * @param at - Preferred centre.
   * @param width - Label width.
   * @returns A centre that does not overlap anything claimed so far.
   */
  place(at: Point, width: number): Point {
    const h = 14;
    // Alternate above and below the line, widening each time.
    for (const dy of [0, -16, 16, -32, 32, -48, 48, -64, 64, -80, 80]) {
      const box = { x: at.x - width / 2, y: at.y - h / 2 + dy, w: width, h };
      const clash = this.#claimed.some(
        (c) => box.x < c.x + c.w && c.x < box.x + box.w && box.y < c.y + c.h && c.y < box.y + box.h,
      );
      if (!clash) {
        this.#claimed.push(box);
        return { x: at.x, y: at.y + dy };
      }
    }
    return at;
  }
}

function renderDefs(colors: readonly string[]): string {
  // One arrowhead per colour in use. Markers cannot inherit stroke, so each needs its own.
  const markers = [...new Set(colors)]
    .map(
      (color) =>
        `<marker id="${markerId(color)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
        `<path d="M 0 0 L 10 5 L 0 10 z" fill="${safeColor(color)}"/></marker>`,
    )
    .join('');

  return `<defs>${markers}</defs>`;
}

function markerId(color: string): string {
  // Ids must survive being written into `url(#…)`, so anything outside the character set
  // a colour can legitimately use is dropped rather than escaped.
  return `arrow-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * Last line of defence for a colour on its way into an attribute.
 *
 * Colours are validated when the model is built, so this should never have anything to
 * do. It is here because the renderer is the component that would be exploited if that
 * validation were ever bypassed or extended, and a single escape is cheaper than the
 * bug it forecloses.
 */
function safeColor(color: string): string {
  return escape(color);
}

/**
 * How a cable is stroked, taking the theme and its jacket colour into account.
 *
 * @param link - The link to stroke.
 * @param theme - Theme in force.
 * @returns The colour and style to draw with.
 */
export function linkStroke(link: Link, theme: Theme = DEFAULT_THEME): StrokeSpec {
  return strokeFor(link.signal, theme, link.color);
}

function renderEdge(
  link: Link,
  edge: EdgeLayout,
  packer: LabelPacker,
  theme: Theme,
  options: Required<Pick<RenderOptions, 'fontFamily' | 'highlightProblems'>>,
): string {
  const width = link.signal.width;
  // Drawn in the payload's colour — the reader wants to know it is NDI — but dashed and
  // glyphed by the carrier, because that is what says "this one is through the air".
  const wireless = (link.carrier ?? link.signal).wireless;
  const stroke = linkStroke(link, theme);
  const dash = dashArray(stroke, width, wireless);
  const problem = link.compatibility.verdict !== 'ok';
  const parts: string[] = [];

  const markerStart = link.arrow === '<->' ? ` marker-start="url(#${markerId(stroke.color)})"` : '';
  const markerEnd = link.arrow === '--' ? '' : ` marker-end="url(#${markerId(stroke.color)})"`;

  // A problem link gets a soft halo rather than a recoloured stroke, so the signal colour
  // still reads correctly while the fault is impossible to miss. On a monochrome theme
  // there is no colour to preserve, so the halo becomes a wide grey band instead.
  if (problem && options.highlightProblems) {
    parts.push(
      `<polyline points="${polyline(edge.points)}" fill="none" stroke="${safeColor(theme.problem)}" ` +
        `stroke-width="${width + 5}" stroke-opacity="${theme.monochrome ? 0.35 : 0.22}" ` +
        `stroke-linejoin="round"/>`,
    );
  }

  parts.push(
    `<polyline points="${polyline(edge.points)}" fill="none" stroke="${safeColor(stroke.color)}" ` +
      `stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} ` +
      `stroke-linejoin="round"${markerStart}${markerEnd}/>`,
  );

  // A wireless link carries a frequency where a cable carries a length.
  const caption = [link.label, wireless ? link.frequency : link.length].filter(Boolean).join('  ');
  const text = link.via ? `${caption} ⇄`.trim() : caption;

  if (wireless) {
    const at = packer.place(labelAnchor(edge.points), 22);
    parts.push(wirelessGlyph(at, stroke.color));
  }

  if (text) {
    const plateWidth = estimateTextWidth(text, 10) + 8;
    const at = packer.place(labelAnchor(edge.points), plateWidth);
    parts.push(
      `<rect x="${n(at.x - plateWidth / 2)}" y="${n(at.y - 7)}" width="${n(plateWidth)}" ` +
        `height="14" rx="3" fill="${theme.labelPlate}" fill-opacity="0.9"/>`,
      `<text x="${n(at.x)}" y="${n(at.y + 3)}" font-size="10" fill="${theme.muted}" ` +
        `text-anchor="middle" font-family="${escape(options.fontFamily)}">${escape(text)}</text>`,
    );
  }

  return parts.join('');
}

/**
 * Draw a laid-out diagram as an SVG document.
 *
 * @param diagram - The resolved diagram.
 * @param layout - Geometry from {@link layoutDiagram}.
 * @param options - Drawing overrides.
 * @returns A complete, self-contained SVG document.
 */
export function renderSvg(
  diagram: Diagram,
  layout: DiagramLayout,
  options: RenderOptions = {},
): string {
  // A theme pinned in the source wins over one supplied by the caller: the drawing knows
  // how it is meant to look, the caller only knows a default.
  const named = diagram.options['theme'];
  const theme =
    (named ? lookupTheme(named) : undefined) ??
    (typeof options.theme === 'string' ? lookupTheme(options.theme) : options.theme) ??
    DEFAULT_THEME;

  const fontFamily = options.fontFamily ?? DEFAULT_FONT;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const showLegend = options.legend ?? true;
  const highlightProblems = options.highlightProblems ?? true;
  const fontSize = options.fontSize ?? 13;
  const headerHeight = options.headerHeight ?? 30;

  const usedSignals = [...new Map(diagram.links.map((l) => [l.signal.name, l.signal])).values()]
    .filter((s) => s.category !== 'generic')
    .toSorted((a, b) => a.name.localeCompare(b.name));

  const titleHeight = diagram.title ? 34 : 0;
  const legendHeight = showLegend && usedSignals.length > 0 ? 30 : 0;

  // A key with no caption gets counted: five entries under seven drawn runs reads as
  // "five cables" to anybody who has not been told what they are looking at.
  const caption = locale === 'ja' ? '信号種別' : 'Signals';
  const legendNames = usedSignals.map((s) => localise(s.label, locale) || s.name);
  // The canvas has to be at least as wide as the key. It never was, so a drawing with a
  // narrow layout and several signal types ran the key off the right-hand edge.
  const legendWidth =
    legendHeight === 0
      ? 0
      : 16 +
        estimateTextWidth(caption, 11) +
        18 +
        legendNames.reduce((total, name) => total + 27 + estimateTextWidth(name, 11) + 22, 0);

  const width = Math.max(layout.width, legendWidth, 320);
  const height = layout.height + titleHeight + legendHeight;

  const body: string[] = [];

  if (diagram.title) {
    body.push(
      `<text x="16" y="24" font-size="${fontSize + 4}" font-weight="600" fill="${theme.text}" ` +
        `font-family="${escape(fontFamily)}">${escape(diagram.title)}</text>`,
    );
  }

  body.push(`<g transform="translate(0 ${titleHeight})">`);

  // Groups first, so device boxes sit on top of their frames.
  for (const group of layout.groups) {
    const model = diagram.groups.find((g) => g.id === group.id);
    const { x, y, width: w, height: h } = group.bounds;
    body.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="8" ` +
        `fill="${theme.groupFill}" stroke="${theme.groupStroke}" stroke-width="1" stroke-dasharray="4 3"/>`,
      `<text x="${n(x + 12)}" y="${n(y + 18)}" font-size="${fontSize - 1}" fill="${theme.muted}" ` +
        `font-family="${escape(fontFamily)}">${escape(model?.label ?? group.id)}</text>`,
    );
  }

  // Edges below boxes, so a cable never crosses over a device it merely passes.
  const packer = new LabelPacker(layout.devices.map((d) => d.bounds));
  for (const edge of layout.edges) {
    const link = diagram.links.find((l) => l.id === edge.id);
    if (link) body.push(renderEdge(link, edge, packer, theme, { fontFamily, highlightProblems }));
  }

  for (const placed of layout.devices) {
    const device = diagram.devices.find((d) => d.id === placed.id);
    if (!device) continue;
    const { x, y, width: w, height: h } = placed.bounds;
    const stroke = device.implicit ? theme.muted : theme.boxStroke;

    if (device.passive) {
      // A part, not a box in a rack. Drawn as a pill with no header band, because the
      // header band is what makes the other boxes read as equipment — and a reader who
      // cannot tell the splitter from the switcher will look for the splitter in the rack.
      body.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(14, h / 2))}" ` +
          `fill="${theme.background}" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="1 3"/>`,
        `<text x="${n(x + w / 2)}" y="${n(y + headerHeight / 2 + 4)}" font-size="${fontSize - 1}" ` +
          `fill="${theme.muted}" text-anchor="middle" ` +
          `font-family="${escape(fontFamily)}">${escape(device.label)}</text>`,
      );
    } else {
      body.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6" ` +
          `fill="${theme.boxFill}" stroke="${stroke}" stroke-width="1.5"` +
          `${device.implicit ? ' stroke-dasharray="5 3"' : ''}/>`,
        `<path d="M ${n(x)} ${n(y + headerHeight)} h ${n(w)}" stroke="${stroke}" stroke-width="1"/>`,
        `<rect x="${n(x + 1)}" y="${n(y + 1)}" width="${n(w - 2)}" height="${n(headerHeight - 1)}" ` +
          `rx="5" fill="${theme.header}"/>`,
        `<text x="${n(x + w / 2)}" y="${n(y + headerHeight / 2 + 4)}" font-size="${fontSize}" ` +
          `font-weight="600" fill="${theme.text}" text-anchor="middle" ` +
          `font-family="${escape(fontFamily)}">${escape(device.label)}</text>`,
      );
    }

    for (const port of placed.ports) {
      const inward = port.side === 'WEST' || port.side === 'NORTH';
      body.push(
        `<circle cx="${n(port.center.x)}" cy="${n(port.center.y)}" r="3" fill="${stroke}"/>`,
      );
      if (port.side === 'WEST' || port.side === 'EAST') {
        body.push(
          `<text x="${n(port.center.x + (inward ? 8 : -8))}" y="${n(port.center.y + 3.5)}" ` +
            `font-size="${fontSize - 3}" fill="${theme.muted}" ` +
            `text-anchor="${inward ? 'start' : 'end'}" ` +
            `font-family="${escape(fontFamily)}">${escape(port.name)}</text>`,
        );
      } else {
        // Top to bottom. The name cannot sit beside the dot the way it does on a side —
        // there is nothing beside it but the next port — so it goes directly beneath, or
        // above for the bottom edge, sharing the dot's x. Clear of the header band, which
        // the top edge runs along, and clear of the cable, which arrives vertically.
        //
        // Without this branch a vertical drawing had dots and no names at all: the box knew
        // which port was which and the drawing did not say.
        body.push(
          `<text x="${n(port.center.x)}" ` +
            `y="${n(port.side === 'NORTH' ? y + headerHeight + 12 : y + h - 8)}" ` +
            `font-size="${fontSize - 3}" fill="${theme.muted}" text-anchor="middle" ` +
            `font-family="${escape(fontFamily)}">${escape(port.name)}</text>`,
        );
      }
    }
  }

  body.push('</g>');

  if (legendHeight > 0) {
    const y = titleHeight + layout.height + 18;
    let cursor = 16;
    body.push(
      `<text x="${n(cursor)}" y="${n(y + 4)}" font-size="11" font-weight="600" ` +
        `fill="${theme.muted}" font-family="${escape(fontFamily)}">${escape(caption)}</text>`,
    );
    cursor += estimateTextWidth(caption, 11) + 18;
    usedSignals.forEach((signal, i) => {
      const key = strokeFor(signal, theme);
      const dash = dashArray(key, signal.width, signal.wireless);
      const name = legendNames[i] ?? signal.name;
      body.push(
        `<path d="M ${n(cursor)} ${n(y)} h 22" stroke="${safeColor(key.color)}" ` +
          `stroke-width="${signal.width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
        `<text x="${n(cursor + 27)}" y="${n(y + 4)}" font-size="11" fill="${theme.muted}" ` +
          `font-family="${escape(fontFamily)}">${escape(name)}</text>`,
      );
      cursor += 27 + estimateTextWidth(name, 11) + 22;
    });
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="${escape(fontFamily)}">` +
    `<rect width="100%" height="100%" fill="${safeColor(theme.background)}"/>` +
    renderDefs([
      ...diagram.links.map((l) => linkStroke(l, theme).color),
      ...usedSignals.map((sig) => strokeFor(sig, theme).color),
    ]) +
    body.join('') +
    `</svg>`
  );
}

/**
 * Lay out and draw a diagram in one step.
 *
 * @param diagram - The resolved diagram.
 * @param options - Geometry and drawing overrides.
 * @returns A complete, self-contained SVG document.
 */
export async function renderDiagram(
  diagram: Diagram,
  options: RenderOptions = {},
): Promise<string> {
  return renderSvg(diagram, await layoutDiagram(diagram, options), options);
}
