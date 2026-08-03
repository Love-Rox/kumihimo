/**
 * Geometry for a diagram: where every box, port and cable goes.
 *
 * Node and port positions are computed here rather than delegated, because port order
 * carries meaning — `IN 1` must sit above `IN 2`, always, in every render. Only edge
 * routing is handed to ELK, which is what it is genuinely good at.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';

import type { Diagram } from './model.js';

/** An axis-aligned rectangle in diagram coordinates. */
export interface Rect {
  /** Distance from the left edge of the diagram. */
  x: number;
  /** Distance from the top edge of the diagram. */
  y: number;
  /** Horizontal extent. */
  width: number;
  /** Vertical extent. */
  height: number;
}

/** A point in diagram coordinates. */
export interface Point {
  /** Distance from the left edge of the diagram. */
  x: number;
  /** Distance from the top edge of the diagram. */
  y: number;
}

/** Which face of a device box a port sits on. */
export type PortSide = 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';

/** A placed port. */
export interface PortLayout {
  /** Matches {@link Port.id}. */
  id: string;
  /** Port name, for the label. */
  name: string;
  /** Face of the box it sits on. */
  side: PortSide;
  /** Centre of the port, in absolute diagram coordinates. */
  center: Point;
}

/** A placed device box. */
export interface DeviceLayout {
  /** Matches {@link Device.id}. */
  id: string;
  /** Box bounds in absolute diagram coordinates. */
  bounds: Rect;
  /** Ports on this device. */
  ports: PortLayout[];
}

/** A placed group frame. */
export interface GroupLayout {
  /** Matches {@link Group.id}. */
  id: string;
  /** Frame bounds in absolute diagram coordinates. */
  bounds: Rect;
}

/** A routed cable. */
export interface EdgeLayout {
  /** Matches {@link Link.id}. */
  id: string;
  /** Polyline from source port to destination port, in absolute coordinates. */
  points: Point[];
}

/** Everything needed to draw the diagram. */
export interface DiagramLayout {
  /** Total width of the drawing. */
  width: number;
  /** Total height of the drawing. */
  height: number;
  /** Placed devices. */
  devices: DeviceLayout[];
  /** Placed group frames. */
  groups: GroupLayout[];
  /** Routed cables. */
  edges: EdgeLayout[];
}

/** Tunable geometry, all in px. */
export interface LayoutOptions {
  /** Height of the device name band at the top of a box. */
  headerHeight?: number;
  /** Distance between adjacent ports on the same face. */
  portPitch?: number;
  /** Minimum width of a device box. */
  minDeviceWidth?: number;
  /** Gap between devices in the same layer. */
  nodeSpacing?: number;
  /** Gap between layers. */
  layerSpacing?: number;
  /** Inset between a group frame and the devices inside it. */
  groupPadding?: number;
  /** Font size used for device labels, which drives box width. */
  fontSize?: number;
  /** Space one `gap` step leaves between ports, px. Defaults to half a port pitch. */
  gapStep?: number;
}

/** Resolved geometry constants. */
interface Metrics {
  headerHeight: number;
  portPitch: number;
  gapStep: number;
  minDeviceWidth: number;
  nodeSpacing: number;
  layerSpacing: number;
  groupPadding: number;
  fontSize: number;
}

function resolveMetrics(options: LayoutOptions): Metrics {
  const portPitch = options.portPitch ?? 22;
  return {
    headerHeight: options.headerHeight ?? 30,
    portPitch,
    // Half a pitch: enough that the eye stops there, not so much that a sixteen-channel
    // desk with three gaps in it grows a third taller.
    gapStep: options.gapStep ?? portPitch / 2,
    minDeviceWidth: options.minDeviceWidth ?? 150,
    nodeSpacing: options.nodeSpacing ?? 40,
    layerSpacing: options.layerSpacing ?? 90,
    groupPadding: options.groupPadding ?? 24,
    fontSize: options.fontSize ?? 13,
  };
}

/**
 * Running offsets for a strip of ports, one entry per port.
 *
 * A gap moves everything below it down; the space is added before the port that asked for
 * it, never after, so `gap` above a declaration reads the way it is written.
 */
function gapOffsets(list: { gapBefore?: number }[], gapStep: number): number[] {
  let offset = 0;
  return list.map((p) => {
    offset += (p.gapBefore ?? 0) * gapStep;
    return offset;
  });
}

/**
 * Approximate the rendered width of a string.
 *
 * There are no font metrics available in Node, and the renderer must size boxes before
 * anything is drawn. CJK glyphs are full-width and Latin ones roughly half, which is
 * close enough to keep labels inside their boxes.
 *
 * @param text - The string to measure.
 * @param fontSize - Font size in px.
 * @returns Estimated width in px.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    // CJK, kana and full-width forms occupy a full em; almost everything else about half.
    units += /[⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 1 : 0.55;
  }
  return units * fontSize;
}

/** The part of a port this file needs: what to draw, and where the blocks break. */
interface SidedPort {
  id: string;
  name: string;
  gapBefore?: number;
}

/** Ports grouped by the face they belong on. */
interface SidedPorts {
  leading: SidedPort[];
  trailing: SidedPort[];
}

/**
 * Which face a bidirectional port belongs on, read off how it is used.
 *
 * `io` says a port *can* go either way, not that it does. Which one it is in this drawing
 * is written down already — in the runs that touch it. A port that only ever receives is
 * an input here, whatever it is capable of, and drawing it on the outgoing face sends
 * every run that reaches it around the box.
 *
 * Only a genuinely two-way port — an L2 switch, a `<->` — is ambiguous, and that keeps the
 * old default. So does a port nothing is connected to: there is nothing to read.
 *
 * @param diagram - The resolved diagram.
 * @param deviceId - Device the port belongs to.
 * @param portName - The port.
 * @returns Whether it should sit on the incoming face.
 */
function receivesOnly(diagram: Diagram, deviceId: string, portName: string): boolean {
  let receives = false;
  let sends = false;
  for (const link of diagram.links) {
    if (link.to.deviceId === deviceId && link.to.portName === portName) receives = true;
    if (link.from.deviceId === deviceId && link.from.portName === portName) sends = true;
  }
  return receives && !sends;
}

/**
 * Decide which face each port sits on.
 *
 * Inputs face the incoming side and outputs the outgoing one, so signal reads along the
 * flow direction. A bidirectional port joins whichever side it is actually used on — see
 * {@link receivesOnly} — and the outputs when it is used both ways or not at all.
 */
function sortPorts(diagram: Diagram, deviceId: string): SidedPorts {
  const device = diagram.devices.find((d) => d.id === deviceId);
  const leading: SidedPort[] = [];
  const trailing: SidedPort[] = [];
  for (const port of device?.ports ?? []) {
    const sided: SidedPort = { id: port.id, name: port.name };
    if (port.gapBefore !== undefined) sided.gapBefore = port.gapBefore;
    const incoming =
      port.direction === 'in' ||
      (port.direction === 'io' && receivesOnly(diagram, deviceId, port.name));
    (incoming ? leading : trailing).push(sided);
  }
  return { leading, trailing };
}

/** Geometry of a single device box, before it is positioned. */
interface BoxSpec {
  width: number;
  height: number;
  ports: { id: string; name: string; side: PortSide; dx: number; dy: number }[];
}

function measureDevice(
  diagram: Diagram,
  deviceId: string,
  m: Metrics,
  horizontal: boolean,
): BoxSpec {
  const device = diagram.devices.find((d) => d.id === deviceId)!;
  const { leading, trailing } = sortPorts(diagram, deviceId);

  const leadingGaps = gapOffsets(leading, m.gapStep);
  const trailingGaps = gapOffsets(trailing, m.gapStep);

  const labelWidth = estimateTextWidth(device.label, m.fontSize) + 24;
  const portLabelWidth = (list: { name: string }[]) =>
    list.reduce((max, p) => Math.max(max, estimateTextWidth(p.name, m.fontSize - 2)), 0);

  const ports: BoxSpec['ports'] = [];

  if (horizontal) {
    const width = Math.max(
      m.minDeviceWidth,
      labelWidth,
      portLabelWidth(leading) + portLabelWidth(trailing) + 48,
    );
    // Gaps count towards the height, or the last port of a gapped strip sits below the box
    // that contains it. Added to the existing formula rather than replacing it, so a
    // device with no gaps measures exactly as it did before.
    const rows = Math.max(leading.length, trailing.length);
    const deepestGap = Math.max(leadingGaps.at(-1) ?? 0, trailingGaps.at(-1) ?? 0);
    const height = Math.max(
      m.headerHeight + 20,
      m.headerHeight + 10 + rows * m.portPitch + deepestGap,
    );

    const place = (
      list: { id: string; name: string }[],
      gaps: number[],
      side: PortSide,
      dx: number,
    ): void => {
      list.forEach((p, i) => {
        ports.push({ ...p, side, dx, dy: m.headerHeight + 12 + i * m.portPitch + (gaps[i] ?? 0) });
      });
    };
    place(leading, leadingGaps, 'WEST', 0);
    place(trailing, trailingGaps, 'EAST', width);
    return { width, height, ports };
  }

  // Top-to-bottom: inputs along the top edge, outputs along the bottom. Gaps widen the
  // box here rather than lengthening it, since the strips run across.
  // A column has to be wide enough for the name written under it, not merely for the dot.
  // The horizontal branch has always measured port labels; this one did not, because it was
  // not drawing any — so `CH15` and `CH16` would have landed on top of each other the moment
  // the labels appeared.
  //
  // Measured per edge and then compared, rather than one slot wide enough for both: two
  // outputs called `MAIN_L` and `MAIN_R` would otherwise widen all sixteen input columns to
  // fit a name none of them carries.
  const edgeWidth = (list: { name: string }[], gaps: number[]): number =>
    list.length * Math.max(m.portPitch, portLabelWidth(list) + 8) + 24 + (gaps.at(-1) ?? 0);
  const width = Math.max(
    m.minDeviceWidth,
    labelWidth,
    edgeWidth(leading, leadingGaps),
    edgeWidth(trailing, trailingGaps),
  );
  const height = m.headerHeight + 44;
  const place = (
    list: { id: string; name: string }[],
    gaps: number[],
    side: PortSide,
    dy: number,
  ): void => {
    const step = (width - (gaps.at(-1) ?? 0)) / (list.length + 1);
    list.forEach((p, i) => {
      ports.push({ ...p, side, dx: step * (i + 1) + (gaps[i] ?? 0), dy });
    });
  };
  place(leading, leadingGaps, 'NORTH', 0);
  place(trailing, trailingGaps, 'SOUTH', height);
  return { width, height, ports };
}

/**
 * Lay out a diagram.
 *
 * Device boxes and port positions are fixed here; ELK is asked only to place the boxes
 * and route the cables orthogonally between the port positions it is given.
 *
 * @param diagram - The resolved diagram to place.
 * @param options - Geometry overrides.
 * @returns Absolute coordinates for every box, port and cable.
 */
export async function layoutDiagram(
  diagram: Diagram,
  options: LayoutOptions = {},
): Promise<DiagramLayout> {
  const m = resolveMetrics(options);
  const horizontal = diagram.direction === 'LR';

  const specs = new Map<string, BoxSpec>();
  for (const device of diagram.devices) {
    specs.set(device.id, measureDevice(diagram, device.id, m, horizontal));
  }

  const toElkNode = (deviceId: string): ElkNode => {
    const spec = specs.get(deviceId)!;
    return {
      id: `dev:${deviceId}`,
      width: spec.width,
      height: spec.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: spec.ports.map((p) => ({
        id: `port:${p.id}`,
        x: p.dx,
        y: p.dy,
        width: 1,
        height: 1,
        layoutOptions: { 'elk.port.side': p.side },
      })),
    };
  };

  // An edge must live on the lowest node containing both its ends. ELK reports edge
  // geometry in the coordinate system of whichever node holds the edge, so parking
  // everything on the root silently yields group-relative points for the links that
  // happen to stay inside one group.
  const groupOf = new Map<string, string>();
  const parentOf = new Map<string, string | undefined>();
  for (const group of diagram.groups) {
    parentOf.set(group.id, group.parent);
    for (const id of group.deviceIds) groupOf.set(id, group.id);
  }

  /** Every group containing a device, outermost first. */
  const chainOf = (deviceId: string): string[] => {
    const chain: string[] = [];
    for (let id = groupOf.get(deviceId); id !== undefined; id = parentOf.get(id)) {
      chain.unshift(id);
    }
    return chain;
  };

  const edgesByContainer = new Map<string, ElkExtendedEdge[]>();
  for (const link of diagram.links) {
    // The lowest group holding both ends, not merely "the same immediate group". A camera
    // inside `devices > cameras` running to a switcher inside `devices` shares `devices`,
    // and ELK lays the edge out there whatever we say — so an edge parked on the root came
    // back in the group's coordinates and was drawn a whole group's origin away from the
    // boxes it joins. Present as a line that is simply not there.
    const from = chainOf(link.from.deviceId);
    const to = chainOf(link.to.deviceId);
    let shared: string | undefined;
    for (let i = 0; i < Math.min(from.length, to.length) && from[i] === to[i]; i += 1) {
      shared = from[i];
    }
    const container = shared === undefined ? 'root' : `grp:${shared}`;
    const edge: ElkExtendedEdge = {
      id: `edge:${link.id}`,
      sources: [`port:${link.from.deviceId}.${link.from.portName}`],
      targets: [`port:${link.to.deviceId}.${link.to.portName}`],
    };
    const list = edgesByContainer.get(container);
    if (list) list.push(edge);
    else edgesByContainer.set(container, [edge]);
  }

  const grouped = new Set(diagram.groups.flatMap((g) => g.deviceIds));

  /**
   * Build one group and everything inside it.
   *
   * Recursive because groups nest: a venue holds a stage and a rack, and the stage holds
   * the cameras. Built flat, the outer one had no children of its own, nothing to size
   * itself from, and came out at NaN by NaN.
   */
  const toGroupNode = (group: (typeof diagram.groups)[number]): ElkNode => ({
    id: `grp:${group.id}`,
    layoutOptions: {
      'elk.padding': `[top=${m.groupPadding + 14},left=${m.groupPadding},bottom=${m.groupPadding},right=${m.groupPadding}]`,
      // Spacing does not inherit into a child graph, and without it devices inside a
      // group end up close enough that cable labels have nowhere to sit.
      'elk.spacing.nodeNode': String(m.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(m.layerSpacing),
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.edgeNode': '16',
    },
    children: [
      ...group.deviceIds.filter((id) => specs.has(id)).map(toElkNode),
      ...diagram.groups.filter((g) => g.parent === group.id).map(toGroupNode),
    ],
    edges: edgesByContainer.get(`grp:${group.id}`) ?? [],
  });

  const children: ElkNode[] = [
    ...diagram.groups.filter((group) => group.parent === undefined).map(toGroupNode),
    ...diagram.devices.filter((d) => !grouped.has(d.id)).map((d) => toElkNode(d.id)),
  ];

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': horizontal ? 'RIGHT' : 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': String(m.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(m.layerSpacing),
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.edgeNode': '16',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children,
    edges: edgesByContainer.get('root') ?? [],
  };

  const result = await new ELK().layout(graph);
  return flatten(result, m);
}

/** ELK reports child coordinates relative to their parent; the renderer wants absolute. */
function flatten(root: ElkNode, m: Metrics): DiagramLayout {
  const devices: DeviceLayout[] = [];
  const groups: GroupLayout[] = [];
  const edges: EdgeLayout[] = [];
  // Edge sections are relative to the edge's container, which is the node whose subtree
  // holds both endpoints — so containers are tracked alongside the walk.
  const walk = (node: ElkNode, ox: number, oy: number): void => {
    const x = ox + (node.x ?? 0);
    const y = oy + (node.y ?? 0);

    if (node.id.startsWith('dev:')) {
      devices.push({
        id: node.id.slice(4),
        bounds: { x, y, width: node.width ?? 0, height: node.height ?? 0 },
        ports: (node.ports ?? []).map((p) => ({
          id: p.id.slice(5),
          name: p.id.slice(p.id.indexOf('.') + 1),
          side: (p.layoutOptions?.['elk.port.side'] as PortSide) ?? 'WEST',
          center: { x: x + (p.x ?? 0), y: y + (p.y ?? 0) },
        })),
      });
    } else if (node.id.startsWith('grp:')) {
      groups.push({
        id: node.id.slice(4),
        bounds: { x, y, width: node.width ?? 0, height: node.height ?? 0 },
      });
    }

    for (const edge of node.edges ?? []) {
      const points: Point[] = [];
      for (const section of edge.sections ?? []) {
        points.push({ x: x + section.startPoint.x, y: y + section.startPoint.y });
        for (const bend of section.bendPoints ?? []) points.push({ x: x + bend.x, y: y + bend.y });
        points.push({ x: x + section.endPoint.x, y: y + section.endPoint.y });
      }
      if (points.length > 0) edges.push({ id: edge.id.slice(5), points });
    }

    for (const child of node.children ?? []) walk(child, x, y);
  };

  walk(root, 0, 0);

  return {
    width: root.width ?? 0,
    height: Math.max(root.height ?? 0, m.headerHeight),
    devices,
    groups,
    edges,
  };
}
