/**
 * Export to draw.io (diagrams.net) XML.
 *
 * The point of exporting is that the drawing keeps working after it leaves kumihimo, so
 * ports are emitted as child cells of their device and edges attach to those ports rather
 * than to the boxes. Drag a switcher in draw.io and its cables follow the right
 * connectors — which is the whole reason this tool models ports in the first place. An
 * export that flattened them would look identical and be useless the moment anyone edited
 * it.
 */

import type { DiagramLayout, LayoutOptions } from '../layout.js';
import { layoutDiagram } from '../layout.js';
import type { Diagram, Link } from '../model.js';
import type { Theme } from '../theme.js';
import { DEFAULT_THEME, lookupTheme, strokeFor } from '../theme.js';

/** How to export. */
export interface DrawioOptions extends LayoutOptions {
  /** Colour theme, by name or as an object. Defaults to the diagram's own, then light. */
  theme?: string | Theme;
  /** Name given to the page inside the file. */
  pageName?: string;
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** draw.io ids may not contain the characters kumihimo allows in a device id. */
function cellId(prefix: string, raw: string): string {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, (char) => `u${char.codePointAt(0) ?? 0}`)}`;
}

/** Round a pixel coordinate. A tenth of a pixel is past what anyone can see. */
function n(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Round a relative position.
 *
 * Port positions are fractions of their device box, so pixel precision is nowhere near
 * enough: rounding a fraction to one decimal leaves eleven possible positions, and a
 * sixteen-channel mixer collapses its inputs into pairs sitting on top of each other.
 */
function frac(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Style fragment giving a link its signal's appearance. */
function edgeStyle(link: Link, theme: Theme): string {
  const stroke = strokeFor(link.signal, theme, link.color);
  const width = link.signal.width;

  const dash =
    link.signal.wireless || stroke.style !== 'solid'
      ? `dashed=1;dashPattern=${link.signal.wireless ? `${width * 5} ${width * 3}` : stroke.style === 'dotted' ? `${width} ${width * 2}` : `${width * 3} ${width * 2}`};`
      : 'dashed=0;';

  const end = link.arrow === '--' ? 'none' : 'block';
  const start = link.arrow === '<->' ? 'block' : 'none';

  return (
    `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=auto;orthogonalLoop=1;` +
    `strokeColor=${stroke.color};strokeWidth=${width};${dash}` +
    `startArrow=${start};startFill=1;endArrow=${end};endFill=1;` +
    `fontSize=9;fontColor=${theme.muted};labelBackgroundColor=${theme.labelPlate};`
  );
}

/**
 * Serialise a laid-out diagram as a draw.io file.
 *
 * @param diagram - The resolved diagram.
 * @param layout - Geometry from {@link layoutDiagram}.
 * @param options - Theme and page name.
 * @returns A complete `.drawio` document.
 */
export function exportDrawio(
  diagram: Diagram,
  layout: DiagramLayout,
  options: DrawioOptions = {},
): string {
  const named = diagram.options['theme'];
  const theme =
    (named ? lookupTheme(named) : undefined) ??
    (typeof options.theme === 'string' ? lookupTheme(options.theme) : options.theme) ??
    DEFAULT_THEME;

  const cells: string[] = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];

  const groupOf = new Map<string, string>();
  for (const group of diagram.groups) {
    for (const id of group.deviceIds) groupOf.set(id, group.id);
  }

  // Groups are containers, so dragging one moves the rack it represents.
  for (const placed of layout.groups) {
    const model = diagram.groups.find((g) => g.id === placed.id);
    cells.push(
      `<mxCell id="${cellId('grp', placed.id)}" value="${escape(model?.label ?? placed.id)}" ` +
        `style="rounded=1;html=1;dashed=1;fillColor=${theme.groupFill};strokeColor=${theme.groupStroke};` +
        `verticalAlign=top;align=left;spacingLeft=10;spacingTop=2;fontSize=11;fontColor=${theme.muted};` +
        `container=1;collapsible=0;movable=1;resizable=1;" vertex="1" parent="1">` +
        `<mxGeometry x="${n(placed.bounds.x)}" y="${n(placed.bounds.y)}" ` +
        `width="${n(placed.bounds.width)}" height="${n(placed.bounds.height)}" as="geometry" />` +
        `</mxCell>`,
    );
  }

  for (const placed of layout.devices) {
    const device = diagram.devices.find((d) => d.id === placed.id);
    if (!device) continue;

    const groupId = groupOf.get(device.id);
    const parent = groupId === undefined ? '1' : cellId('grp', groupId);
    const frame = groupId === undefined ? undefined : layout.groups.find((g) => g.id === groupId);

    // Children are positioned relative to their container.
    const x = placed.bounds.x - (frame?.bounds.x ?? 0);
    const y = placed.bounds.y - (frame?.bounds.y ?? 0);

    const stroke = device.implicit ? theme.muted : theme.boxStroke;
    cells.push(
      `<mxCell id="${cellId('dev', device.id)}" value="${escape(device.label)}" ` +
        `style="rounded=1;html=1;whiteSpace=wrap;fillColor=${theme.boxFill};strokeColor=${stroke};` +
        `${device.implicit ? 'dashed=1;' : 'dashed=0;'}verticalAlign=top;spacingTop=4;` +
        `fontSize=12;fontStyle=1;fontColor=${theme.text};" vertex="1" parent="${parent}">` +
        `<mxGeometry x="${n(x)}" y="${n(y)}" ` +
        `width="${n(placed.bounds.width)}" height="${n(placed.bounds.height)}" as="geometry" />` +
        `</mxCell>`,
    );

    for (const port of placed.ports) {
      // Fractions of the device box, so the port stays put when the box is resized.
      const fx =
        placed.bounds.width === 0 ? 0 : (port.center.x - placed.bounds.x) / placed.bounds.width;
      const fy =
        placed.bounds.height === 0 ? 0 : (port.center.y - placed.bounds.y) / placed.bounds.height;
      const inward = port.side === 'WEST' || port.side === 'NORTH';

      cells.push(
        `<mxCell id="${cellId('port', port.id)}" value="${escape(port.name)}" ` +
          `style="ellipse;html=1;fillColor=${stroke};strokeColor=none;fontSize=8;fontColor=${theme.muted};` +
          `align=${inward ? 'left' : 'right'};labelPosition=${inward ? 'right' : 'left'};verticalLabelPosition=middle;verticalAlign=middle;` +
          `spacing=4;portConstraint=${port.side.toLowerCase()};" vertex="1" ` +
          `parent="${cellId('dev', device.id)}">` +
          `<mxGeometry x="${frac(fx)}" y="${frac(fy)}" width="7" height="7" relative="1" as="geometry">` +
          `<mxPoint x="-3.5" y="-3.5" as="offset" /></mxGeometry></mxCell>`,
      );
    }
  }

  for (const link of diagram.links) {
    const caption = [
      link.label,
      link.signal.wireless ? link.frequency : link.length,
      link.via ? `⇄ ${link.via}` : undefined,
    ]
      .filter(Boolean)
      .join('  ');

    cells.push(
      `<mxCell id="${cellId('edge', link.id)}" value="${escape(caption)}" ` +
        `style="${edgeStyle(link, theme)}" edge="1" parent="1" ` +
        `source="${cellId('port', `${link.from.deviceId}.${link.from.portName}`)}" ` +
        `target="${cellId('port', `${link.to.deviceId}.${link.to.portName}`)}">` +
        `<mxGeometry relative="1" as="geometry" /></mxCell>`,
    );
  }

  const page = escape(options.pageName ?? diagram.title ?? 'kumihimo');

  return (
    `<mxfile host="kumihimo" type="device">` +
    `<diagram id="kumihimo" name="${page}">` +
    `<mxGraphModel dx="${Math.round(layout.width)}" dy="${Math.round(layout.height)}" ` +
    `grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" ` +
    `page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0" ` +
    `background="${theme.background}">` +
    `<root>${cells.join('')}</root>` +
    `</mxGraphModel></diagram></mxfile>`
  );
}

/**
 * Lay out a diagram and export it as a draw.io file in one step.
 *
 * @param diagram - The resolved diagram.
 * @param options - Geometry, theme and page name.
 * @returns A complete `.drawio` document.
 */
export async function toDrawio(diagram: Diagram, options: DrawioOptions = {}): Promise<string> {
  return exportDrawio(diagram, await layoutDiagram(diagram, options), options);
}
