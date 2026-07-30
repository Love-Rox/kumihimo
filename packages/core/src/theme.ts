/**
 * Colour themes for the rendered diagram.
 *
 * A signal flow diagram is not only looked at on a screen. It gets printed and taped to
 * a rack, which is why one of the built-in themes throws colour away entirely and leans
 * on line style instead — a monochrome print where every cable is the same black line is
 * useless, and that is what happens if a colour scheme is the only way signals differ.
 */

import type { LineStyle, SignalCategory, SignalType } from './signals.js';

/** How a cable should be stroked under a given theme. */
export interface StrokeSpec {
  /** Stroke colour. */
  color: string;
  /** Stroke style. */
  style: LineStyle;
}

/** A complete set of drawing colours. */
export interface Theme {
  /** Identifier used in `diagram { theme: … }`. */
  name: string;
  /** Page background. */
  background: string;
  /** Device box fill. */
  boxFill: string;
  /** Device box outline. */
  boxStroke: string;
  /** Device name band fill. */
  header: string;
  /** Primary text. */
  text: string;
  /** Secondary text: port names, cable labels, group names. */
  muted: string;
  /** Group frame fill. */
  groupFill: string;
  /** Group frame outline. */
  groupStroke: string;
  /** Halo drawn under a cable that failed its compatibility check. */
  problem: string;
  /** Background of the plate a cable label sits on. */
  labelPlate: string;
  /**
   * Whether the theme discards signal colours.
   *
   * When true, {@link strokeFor} distinguishes signals by line style alone and any
   * `[color=…]` on a cable is ignored, because it would not survive the medium anyway.
   */
  monochrome: boolean;
}

/**
 * Line styles used to tell signal families apart when colour is unavailable.
 *
 * Six categories need six visually distinct strokes; with only three dash styles to hand
 * the renderer also varies width, which is what a hand-drawn monochrome schematic does.
 */
const MONO_STYLES: Readonly<Record<SignalCategory, LineStyle>> = {
  video: 'solid',
  audio: 'dashed',
  control: 'dotted',
  network: 'dashed',
  power: 'dotted',
  sync: 'dashed',
  generic: 'solid',
};

/** The themes kumihimo ships with, keyed by name. */
export const THEMES: Readonly<Record<string, Theme>> = {
  light: {
    name: 'light',
    background: '#ffffff',
    boxFill: '#ffffff',
    boxStroke: '#334155',
    header: '#f1f5f9',
    text: '#0f172a',
    muted: '#64748b',
    groupFill: '#f8fafc',
    groupStroke: '#94a3b8',
    problem: '#dc2626',
    labelPlate: '#ffffff',
    monochrome: false,
  },
  dark: {
    name: 'dark',
    background: '#0f172a',
    boxFill: '#1e293b',
    boxStroke: '#94a3b8',
    header: '#334155',
    text: '#f8fafc',
    muted: '#cbd5e1',
    groupFill: '#16233c',
    groupStroke: '#475569',
    problem: '#f87171',
    labelPlate: '#0f172a',
    monochrome: false,
  },
  // For drawings that will be photocopied or faxed to site.
  mono: {
    name: 'mono',
    background: '#ffffff',
    boxFill: '#ffffff',
    boxStroke: '#000000',
    header: '#eeeeee',
    text: '#000000',
    muted: '#333333',
    groupFill: '#fafafa',
    groupStroke: '#666666',
    problem: '#000000',
    labelPlate: '#ffffff',
    monochrome: true,
  },
  // Traditional blueprint colouring, still common on facility drawings.
  blueprint: {
    name: 'blueprint',
    background: '#0b3a6f',
    boxFill: '#0b3a6f',
    boxStroke: '#dbeafe',
    header: '#124a8a',
    text: '#f0f9ff',
    muted: '#bfdbfe',
    groupFill: '#0d4079',
    groupStroke: '#60a5fa',
    problem: '#fca5a5',
    labelPlate: '#0b3a6f',
    monochrome: false,
  },
};

/** The theme used when none is named. */
export const DEFAULT_THEME: Theme = THEMES['light']!;

/**
 * Look up a theme by name.
 *
 * @param name - Theme name, case-insensitive.
 * @returns The theme, or `undefined` when no theme has that name.
 */
export function lookupTheme(name: string): Theme | undefined {
  return THEMES[name.toLowerCase()];
}

/**
 * Decide how a cable is stroked.
 *
 * A jacket colour written with `[color=…]` wins over the signal-type convention, but a
 * monochrome theme overrides both: on a black and white print the honest thing is to
 * distinguish signals by line style rather than to pretend a colour survived.
 *
 * @param signal - Signal type carried by the cable.
 * @param theme - Theme in force.
 * @param cableColor - Jacket colour written on the link, if any.
 * @returns The colour and style to stroke with.
 */
export function strokeFor(signal: SignalType, theme: Theme, cableColor?: string): StrokeSpec {
  if (theme.monochrome) {
    return { color: theme.boxStroke, style: MONO_STYLES[signal.category] };
  }
  return { color: cableColor ?? signal.color, style: signal.style };
}
