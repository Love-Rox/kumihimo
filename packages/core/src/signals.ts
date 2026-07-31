/**
 * Signal type registry.
 *
 * A signal type is what makes a kumihimo diagram more than a flowchart: it carries the
 * drawing convention (colour, line style) and the rules that let the validator reject
 * physically impossible wiring.
 */

/**
 * Broad family a signal belongs to.
 *
 * Categories drive the default palette and are the unit that compatibility rules
 * are usually expressed against.
 */
export type SignalCategory =
  | 'video'
  | 'audio'
  | 'control'
  | 'network'
  | 'power'
  | 'sync'
  | 'generic';

/** Stroke style used when drawing a link. */
export type LineStyle = 'solid' | 'dashed' | 'dotted';

/**
 * A resolved signal type, ready for validation and rendering.
 */
export interface SignalType {
  /** Identifier used in the DSL, e.g. `sdi`. */
  name: string;
  /** Family this signal belongs to. */
  category: SignalCategory;
  /** Human readable name drawn on the diagram, e.g. `SDI`. */
  label: string;
  /** Stroke colour as a CSS hex string. */
  color: string;
  /** Stroke style. */
  style: LineStyle;
  /** Stroke width in px. */
  width: number;
  /**
   * Whether the medium is inherently two-way.
   *
   * Dante and Ethernet carry traffic in both directions over one cable, so a single
   * link represents both; SDI does not.
   */
  bidirectional: boolean;
  /**
   * Whether the signal travels over the air rather than down a cable.
   *
   * A wireless link has no length, no connector and nothing to order from a cable
   * supplier, so the validator stops asking for those and the renderer draws it as a
   * radio path rather than a wire.
   */
  wireless: boolean;
  /** Connectors this signal is typically terminated with, for labelling and reports. */
  connectors: string[];
}

/**
 * Default stroke colour per category.
 *
 * There is no cross-industry standard for signal colours — every firm has its own
 * drawing convention — so these are chosen to stay distinguishable for the most common
 * forms of colour vision deficiency rather than to match any particular house style.
 * Override per signal with a `signal` declaration in the DSL.
 */
export const CATEGORY_COLORS: Readonly<Record<SignalCategory, string>> = {
  video: '#e11d48',
  audio: '#2563eb',
  control: '#16a34a',
  network: '#9333ea',
  power: '#ea580c',
  sync: '#0891b2',
  generic: '#64748b',
};

/** Default stroke style per category. */
export const CATEGORY_STYLES: Readonly<Record<SignalCategory, LineStyle>> = {
  video: 'solid',
  audio: 'solid',
  control: 'dashed',
  network: 'solid',
  power: 'dashed',
  sync: 'dotted',
  generic: 'solid',
};

/** Shape of a builtin entry before category defaults are applied. */
interface SignalSeed {
  category: SignalCategory;
  label: string;
  connectors: string[];
  bidirectional?: boolean;
  wireless?: boolean;
  color?: string;
  style?: LineStyle;
  width?: number;
}

const SEEDS: Record<string, SignalSeed> = {
  // ── video ───────────────────────────────────────────────────────────────
  sdi: { category: 'video', label: 'SDI', connectors: ['BNC'] },
  hdmi: { category: 'video', label: 'HDMI', connectors: ['HDMI'] },
  dp: { category: 'video', label: 'DisplayPort', connectors: ['DisplayPort'] },
  dvi: { category: 'video', label: 'DVI', connectors: ['DVI-D', 'DVI-I'] },
  vga: { category: 'video', label: 'VGA', connectors: ['D-sub 15'] },
  composite: { category: 'video', label: 'Composite', connectors: ['BNC', 'RCA'] },
  component: { category: 'video', label: 'Component', connectors: ['BNC', 'RCA'] },
  hdbaset: { category: 'video', label: 'HDBaseT', connectors: ['RJ45'] },
  ndi: { category: 'video', label: 'NDI', connectors: ['RJ45'], bidirectional: true },
  st2110: { category: 'video', label: 'ST 2110', connectors: ['RJ45', 'SFP'], bidirectional: true },
  fiber: { category: 'video', label: 'Fiber', connectors: ['LC', 'SC', 'OpticalCON'] },

  // ── audio ───────────────────────────────────────────────────────────────
  xlr: { category: 'audio', label: 'XLR', connectors: ['XLR-M', 'XLR-F'] },
  // Jack types are split by barrel size, because size is what decides whether the plug
  // goes in at all. One type listing both could never answer the question a drawing is for.
  //
  // The rule is uniform: a bare name is 1/4", a `35` suffix is 3.5mm. TRRS is far more
  // often seen as 3.5mm, so `trrs` meaning the 1/4" one is the less expected reading — but
  // a rule that holds everywhere is easier to carry than one with an exception in it, and
  // `trs` already means 1/4".
  trs: { category: 'audio', label: 'TRS 1/4"', connectors: ['TRS 1/4"'] },
  trs35: { category: 'audio', label: 'TRS 3.5mm', connectors: ['TRS 3.5mm'] },
  // Four conductors — left, right, microphone, ground. The headset connector.
  trrs: { category: 'audio', label: 'TRRS 1/4"', connectors: ['TRRS 1/4"'] },
  trrs35: { category: 'audio', label: 'TRRS 3.5mm', connectors: ['TRRS 3.5mm'] },
  rca: { category: 'audio', label: 'RCA', connectors: ['RCA'] },
  speakon: { category: 'audio', label: 'Speakon', connectors: ['NL4', 'NL8'] },
  aes: { category: 'audio', label: 'AES/EBU', connectors: ['XLR', 'BNC'] },
  dante: { category: 'audio', label: 'Dante', connectors: ['RJ45'], bidirectional: true },
  madi: { category: 'audio', label: 'MADI', connectors: ['BNC', 'SC'] },
  adat: { category: 'audio', label: 'ADAT', connectors: ['TOSLINK'] },
  spdif: { category: 'audio', label: 'S/PDIF', connectors: ['RCA', 'TOSLINK'] },
  optical: { category: 'audio', label: 'Optical', connectors: ['TOSLINK'] },

  // ── control ─────────────────────────────────────────────────────────────
  rs232: { category: 'control', label: 'RS-232', connectors: ['D-sub 9'], bidirectional: true },
  rs422: { category: 'control', label: 'RS-422', connectors: ['D-sub 9'], bidirectional: true },
  rs485: { category: 'control', label: 'RS-485', connectors: ['D-sub 9', 'XLR'] },
  dmx: { category: 'control', label: 'DMX', connectors: ['XLR-5', 'XLR-3'] },
  midi: { category: 'control', label: 'MIDI', connectors: ['DIN-5'] },
  gpio: { category: 'control', label: 'GPIO', connectors: ['Terminal', 'D-sub'] },
  ir: { category: 'control', label: 'IR', connectors: [], wireless: true },

  // ── network ─────────────────────────────────────────────────────────────
  lan: { category: 'network', label: 'LAN', connectors: ['RJ45'], bidirectional: true },
  usb: {
    category: 'network',
    label: 'USB',
    connectors: ['USB-A', 'USB-B', 'USB-C'],
    bidirectional: true,
  },

  // ── wireless ────────────────────────────────────────────────────────────
  // The medium is over-the-air but the content is not: wireless video is still video and
  // a radio mic is still audio, so these keep their family's colour and only the way the
  // link is drawn and validated changes.
  wifi: {
    category: 'network',
    label: 'Wi-Fi',
    connectors: [],
    bidirectional: true,
    wireless: true,
  },
  bluetooth: {
    category: 'network',
    label: 'Bluetooth',
    connectors: [],
    bidirectional: true,
    wireless: true,
  },
  uhf: { category: 'audio', label: 'ワイヤレス (UHF)', connectors: [], wireless: true },
  iem: { category: 'audio', label: 'IEM', connectors: [], wireless: true },
  'wireless-video': { category: 'video', label: '無線映像', connectors: [], wireless: true },
  'wireless-dmx': { category: 'control', label: '無線 DMX', connectors: [], wireless: true },

  // ── power ───────────────────────────────────────────────────────────────
  ac: { category: 'power', label: 'AC', connectors: ['IEC C13', 'IEC C14', 'NEMA'] },
  dc: { category: 'power', label: 'DC', connectors: ['Barrel', 'XLR-4'] },
  poe: { category: 'power', label: 'PoE', connectors: ['RJ45'] },
  // Power over the USB-C connector, and its own type for the same reason PoE is one: the
  // cable is shared with the data, but what the drawing records is that this device is fed.
  usbpd: { category: 'power', label: 'USB PD', connectors: ['USB-C'] },

  // ── sync ────────────────────────────────────────────────────────────────
  genlock: { category: 'sync', label: 'Genlock', connectors: ['BNC'] },
  wordclock: { category: 'sync', label: 'Word Clock', connectors: ['BNC'] },
  timecode: { category: 'sync', label: 'Timecode', connectors: ['BNC', 'XLR'] },

  // ── fallback ────────────────────────────────────────────────────────────
  // Used when neither the link nor either port names a signal. It carries no label so
  // an unspecified cable puts no text on the drawing, and compatibility treats it as
  // matching anything — a sketch in progress should not be a wall of warnings.
  generic: { category: 'generic', label: '', connectors: [] },
};

function resolve(name: string, seed: SignalSeed): SignalType {
  return {
    name,
    category: seed.category,
    label: seed.label,
    color: seed.color ?? CATEGORY_COLORS[seed.category],
    style: seed.style ?? CATEGORY_STYLES[seed.category],
    width: seed.width ?? 2,
    bidirectional: seed.bidirectional ?? false,
    wireless: seed.wireless ?? false,
    connectors: seed.connectors,
  };
}

/**
 * The signal types kumihimo knows out of the box, keyed by DSL name.
 *
 * Extend at author time with a `signal` declaration rather than mutating this object.
 */
export const BUILTIN_SIGNALS: Readonly<Record<string, SignalType>> = Object.freeze(
  Object.fromEntries(Object.entries(SEEDS).map(([name, seed]) => [name, resolve(name, seed)])),
);

/**
 * A lookup table of signal types, produced by merging user `signal` declarations
 * over {@link BUILTIN_SIGNALS}.
 */
export type SignalRegistry = Readonly<Record<string, SignalType>>;

/**
 * Build a registry from the builtins plus any user-declared signal types.
 *
 * A user declaration sharing a builtin's name overrides it, which is how a house
 * drawing convention gets applied without forking the package.
 *
 * @param custom - User-declared signal types, keyed by DSL name.
 * @returns A frozen registry safe to share across renders.
 */
export function createSignalRegistry(custom: Record<string, SignalType> = {}): SignalRegistry {
  return Object.freeze({ ...BUILTIN_SIGNALS, ...custom });
}

/**
 * Look up a signal type by name.
 *
 * @param registry - Registry to search.
 * @param name - DSL name of the signal, e.g. `sdi`.
 * @returns The signal type, or `undefined` if the name is not registered.
 */
export function lookupSignal(registry: SignalRegistry, name: string): SignalType | undefined {
  return registry[name];
}

/**
 * Colour names accepted where a cable jacket colour is written.
 *
 * Both English and Japanese names are recognised, because the colour of a cable is
 * something people say out loud on site — "青の XLR" — and a drawing that will not accept
 * the word everyone actually uses will be filled in wrongly or not at all.
 */
export const CABLE_COLORS: Readonly<Record<string, string>> = {
  red: '#dc2626',
  赤: '#dc2626',
  blue: '#2563eb',
  青: '#2563eb',
  green: '#16a34a',
  緑: '#16a34a',
  yellow: '#ca8a04',
  黄: '#ca8a04',
  orange: '#ea580c',
  橙: '#ea580c',
  purple: '#9333ea',
  紫: '#9333ea',
  black: '#111827',
  黒: '#111827',
  white: '#e5e7eb',
  白: '#e5e7eb',
  gray: '#6b7280',
  grey: '#6b7280',
  灰: '#6b7280',
  brown: '#92400e',
  茶: '#92400e',
  pink: '#db2777',
  桃: '#db2777',
};

/**
 * Resolve a written colour into a CSS colour.
 *
 * @param value - A name from {@link CABLE_COLORS} or a hex literal such as `#0af`.
 * @returns The CSS colour, or `undefined` when the value is not a colour kumihimo
 *   recognises. Rejecting rather than passing text through keeps arbitrary strings out
 *   of the rendered stroke attribute.
 */
export function resolveCableColor(value: string): string | undefined {
  const named = CABLE_COLORS[value.toLowerCase()] ?? CABLE_COLORS[value];
  if (named) return named;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : undefined;
}
