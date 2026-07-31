/**
 * Rules for whether two ports may legally be wired together.
 *
 * This is where kumihimo earns its keep over a generic flowchart tool: it can tell an
 * author that an SDI output cannot feed an HDMI input without a converter, before anyone
 * shows up on site with the wrong cable.
 *
 * Four tables decide, in order of how much they have to say:
 *
 * - {@link INTERCHANGEABLE_GROUPS} — genuinely equivalent, wire them freely.
 * - {@link CONNECTOR_CONFUSIONS} — the fatal ones. Same connector, different signal, so
 *   the cable seats perfectly and nothing works. These are the mistakes worth catching.
 * - {@link PASSIVE_ADAPTERS} — works, but only with an adapter or conversion cable in
 *   the run. Declared in the DSL with `via`, which puts the adapter on the cable
 *   schedule instead of leaving it to be discovered on site.
 * - {@link LOSSY_PAIRS} — connectable and commonly done, but something is given up.
 *
 * Active conversion — an SDI-to-HDMI box — is deliberately *not* modelled here. That is
 * a device with its own ports and power, so it belongs in the diagram as a
 * `device … as converter`, not as a property of a cable.
 *
 * Every verdict other than plain `ok` carries a reason, and every rule can be overridden
 * per file, so a house convention is expressed in the diagram rather than in a fork.
 */

import type { Locale, Localised } from './messages.js';
import { DEFAULT_LOCALE, localise } from './messages.js';
import type { SignalType } from './signals.js';

/**
 * The outcome of checking one link.
 *
 * - `ok` — a normal, correct connection; no diagnostic.
 * - `lossy` — physically connectable and commonly done, but something is given up
 *   (level, balance, impedance), or an undeclared adapter is required. Reported as a
 *   warning.
 * - `incompatible` — will not work without active conversion.
 */
export type CompatibilityVerdict = 'ok' | 'lossy' | 'incompatible';

/** A verdict together with the rule's explanation, when it has one. */
export interface CompatibilityResult {
  /** How to treat the link. */
  verdict: CompatibilityVerdict;
  /**
   * Why, in the author's language.
   *
   * Carried into the diagnostic message and into exported cable schedules, so the
   * reasoning survives into the document handed to whoever pulls the cable.
   */
  reason?: Localised;
  /**
   * Name of the passive adapter this link needs, when one is involved.
   *
   * Set whether or not the author declared it, so the renderer can mark the link and the
   * cable schedule can list the part either way.
   */
  adapter?: Localised;
}

/**
 * An author-supplied override, produced by a `compat` declaration in the DSL.
 *
 * Overrides are consulted before every builtin table, which is how a site standard
 * ("AES on analogue XLR is fine under 10m here") is stated once at the top of a file
 * and applied throughout — with the rationale attached rather than lost.
 */
export interface CompatibilityRule {
  /** Signal type leaving the source port. */
  from: string;
  /** Signal type expected by the destination port. */
  to: string;
  /** Verdict to force for this pairing. */
  verdict: CompatibilityVerdict;
  /** Why this site treats it that way. */
  reason?: string;
  /** Whether the rule also applies with `from` and `to` swapped. Defaults to `true`. */
  symmetric?: boolean;
}

/**
 * Sets of signal types that may be wired to each other without comment.
 *
 * Membership is symmetric and transitive *within a group*, which is why `optical` shares
 * a group with `adat` and a separate one with `spdif`: TOSLINK carries either, but ADAT
 * and S/PDIF do not understand each other.
 */
export const INTERCHANGEABLE_GROUPS: readonly (readonly string[])[] = [
  // Everything that genuinely rides on Ethernet and can share a switch.
  // HDBaseT is deliberately absent — see CONNECTOR_CONFUSIONS.
  ['lan', 'dante', 'ndi', 'st2110', 'poe'],
  // Balanced analogue audio — an XLR-to-TRS cable is unremarkable.
  ['xlr', 'trs'],
  // TOSLINK as a physical layer, per protocol.
  ['optical', 'adat'],
  ['optical', 'spdif'],
  // Power and data over the same USB-C cable, treated the way PoE and Ethernet are above.
  // Deliberately permissive: whether a given port supplies the wattage a sink wants is a
  // question of numbers this language does not carry, and guessing at it would produce
  // warnings nobody could act on.
  ['usb', 'usbpd'],
];

/** Two signals that share a connector but are not the same thing. */
export interface ConnectorConfusion {
  /** One of the two signal types. */
  a: string;
  /** The other. */
  b: string;
  /** The connector they share, which is why the mistake is easy to make. */
  connector: string;
  /** What actually happens if you wire them together. */
  reason: Localised;
}

/**
 * The mistakes worth catching.
 *
 * Each of these seats perfectly — the plug fits, the cable clicks, nothing looks wrong —
 * and then carries no usable signal. A generic "types differ" warning is not enough here;
 * the author needs to be told *why* the cable that obviously fits is the wrong one.
 */
export const CONNECTOR_CONFUSIONS: readonly ConnectorConfusion[] = [
  {
    a: 'hdbaset',
    b: 'lan',
    connector: 'RJ45',
    reason: {
      en: 'HDBaseT uses Cat cable and RJ45 but is not Ethernet. It does not go into a switch',
      ja: 'HDBaseT は Cat ケーブルと RJ45 を使うが Ethernet ではない。スイッチには挿せない',
    },
  },
  {
    a: 'dmx',
    b: 'xlr',
    connector: 'XLR',
    reason: {
      en: 'DMX uses XLR but is lighting control, not audio. Wiring the two together damages equipment',
      ja: 'DMX は XLR を使うが調光制御であって音声ではない。相互に挿すと機材を傷める',
    },
  },
  {
    a: 'rca',
    b: 'spdif',
    connector: 'RCA',
    reason: {
      en: 'They only share RCA. Analogue audio into a S/PDIF input produces nothing',
      ja: 'RCA を共有するだけ。アナログ音声を S/PDIF 入力に入れても何も出ない',
    },
  },
  {
    a: 'adat',
    b: 'spdif',
    connector: 'TOSLINK',
    reason: {
      en: 'They only share TOSLINK. ADAT and S/PDIF are different protocols',
      ja: 'TOSLINK を共有するだけ。ADAT と S/PDIF はプロトコルが違う',
    },
  },
  {
    a: 'composite',
    b: 'component',
    connector: 'BNC / RCA',
    reason: {
      en: 'Composite is one wire, component is three. It connects and the picture is wrong',
      ja: 'コンポジットは1線、コンポーネントは3線。繋がるが正しい絵にならない',
    },
  },
  {
    a: 'genlock',
    b: 'sdi',
    connector: 'BNC',
    reason: {
      en: 'They only share BNC. A reference input will not lock to video',
      ja: 'BNC を共有するだけ。同期基準入力に映像を入れてもロックしない',
    },
  },
  {
    a: 'wordclock',
    b: 'sdi',
    connector: 'BNC',
    reason: {
      en: 'They only share BNC. A word clock input will not take video',
      ja: 'BNC を共有するだけ。ワードクロック入力は映像を受け付けない',
    },
  },
];

/**
 * A pairing that a passive adapter or conversion cable makes work.
 *
 * "Passive" is the whole point: the underlying signal is already compatible and only the
 * connector or wiring changes. Anything needing power to re-encode is an active converter
 * and belongs in the diagram as a device.
 */
export interface PassiveAdapter {
  /** Signal type leaving the source port. */
  from: string;
  /** Signal type expected by the destination port. */
  to: string;
  /** What to order, in the words used on an invoice. */
  cable: Localised;
  /** Whether the adapter also works with `from` and `to` swapped. Defaults to `true`. */
  symmetric?: boolean;
  /** Anything that bites in practice. */
  caveat?: Localised;
}

/**
 * Conversions achievable with a cable or adapter rather than a box.
 *
 * Declaring one with `via` in the DSL turns the warning into a documented line item, so
 * the adapter gets packed. Leaving it undeclared is still reported — an adapter nobody
 * wrote down is an adapter nobody brings.
 */
export const PASSIVE_ADAPTERS: readonly PassiveAdapter[] = [
  {
    from: 'hdmi',
    to: 'dvi',
    cable: { en: 'HDMI-DVI cable', ja: 'HDMI-DVI 変換ケーブル' },
    caveat: {
      en: 'TMDS is common to both, but audio and HDCP depend on the equipment',
      ja: 'TMDS は共通だが音声と HDCP の扱いは機器依存',
    },
  },
  {
    from: 'dp',
    to: 'hdmi',
    cable: { en: 'DisplayPort-HDMI adapter (passive)', ja: 'DisplayPort-HDMI 変換（パッシブ）' },
    symmetric: false,
    caveat: {
      en: 'Only where the source is Dual-Mode (DP++). Otherwise it needs an active converter',
      ja: 'ソースが Dual-Mode (DP++) の場合のみ。非対応ならアクティブ変換器が要る',
    },
  },
  {
    from: 'dp',
    to: 'dvi',
    cable: { en: 'DisplayPort-DVI adapter (passive)', ja: 'DisplayPort-DVI 変換（パッシブ）' },
    symmetric: false,
    caveat: {
      en: 'Only where the source is Dual-Mode (DP++)',
      ja: 'ソースが Dual-Mode (DP++) の場合のみ',
    },
  },
  {
    from: 'aes',
    to: 'spdif',
    cable: { en: 'AES/EBU to S/PDIF transformer', ja: 'AES/EBU-S/PDIF 変換トランス' },
    caveat: {
      en: 'Needs the 110Ω to 75Ω impedance change. A direct connection will not do',
      ja: '110Ω↔75Ω のインピーダンス変換が要る。直結は不可',
    },
  },
  // Barrel size. Electrically the same thing; the plug simply does not fit the hole, which
  // is the most ordinary adapter on any cart and the easiest one to leave in the workshop.
  {
    from: 'trs',
    to: 'trs35',
    cable: { en: '3.5mm to 6.3mm adapter', ja: '3.5mm-6.3mm 変換プラグ' },
  },
  {
    from: 'trrs',
    to: 'trrs35',
    cable: { en: '3.5mm to 6.3mm adapter (4-pole)', ja: '3.5mm-6.3mm 変換プラグ（4極）' },
    caveat: {
      en: 'A three-pole adapter leaves the microphone contact unconnected. Specify a four-pole one',
      ja: '3極用の変換プラグではマイクの極が繋がらない。4極対応品を指定すること',
    },
  },
];

const groupIndex: ReadonlyMap<string, ReadonlySet<number>> = (() => {
  const index = new Map<string, Set<number>>();
  INTERCHANGEABLE_GROUPS.forEach((group, i) => {
    for (const name of group) {
      let set = index.get(name);
      if (!set) {
        set = new Set();
        index.set(name, set);
      }
      set.add(i);
    }
  });
  return index;
})();

function sharesGroup(a: string, b: string): boolean {
  const ga = groupIndex.get(a);
  const gb = groupIndex.get(b);
  if (!ga || !gb) return false;
  for (const i of ga) {
    if (gb.has(i)) return true;
  }
  return false;
}

/** A pairing that works, with a caveat worth stating. */
export interface LossyPair {
  /** Signal type leaving the source port. */
  from: string;
  /** Signal type expected by the destination port. */
  to: string;
  /** What is given up. */
  reason: Localised;
  /** Whether the caveat applies in both directions. Defaults to `false`. */
  symmetric?: boolean;
}

/**
 * Pairs that connect and carry signal, but lose something worth warning about.
 *
 * Direction matters: balanced-to-unbalanced is a different situation from
 * unbalanced-to-balanced, so these are directional unless marked `symmetric`.
 */
export const LOSSY_PAIRS: readonly LossyPair[] = [
  // Pole count at the same barrel size: the plug seats, and one conductor lands on the
  // wrong contact. Directional — a 3-pole plug in a 4-pole jack is not the same fault as
  // a 4-pole plug in a 3-pole jack, and only the second one silently loses the microphone.
  {
    from: 'trrs35',
    to: 'trs35',
    reason: {
      en: 'Four poles into a three-pole jack. Audio passes, the microphone does not, and the sleeve lands on the ring',
      ja: '4極を3極ジャックへ。音声は通るがマイクは通らず、スリーブがリングに当たる',
    },
  },
  {
    from: 'trs35',
    to: 'trrs35',
    reason: {
      en: 'Three poles into a four-pole jack. The microphone contact is left unconnected',
      ja: '3極を4極ジャックへ。マイクの極が繋がらない',
    },
  },
  {
    from: 'trrs',
    to: 'trs',
    reason: {
      en: 'Four poles into a three-pole jack. Audio passes, the microphone does not, and the sleeve lands on the ring',
      ja: '4極を3極ジャックへ。音声は通るがマイクは通らず、スリーブがリングに当たる',
    },
  },
  {
    from: 'trs',
    to: 'trrs',
    reason: {
      en: 'Three poles into a four-pole jack. The microphone contact is left unconnected',
      ja: '3極を4極ジャックへ。マイクの極が繋がらない',
    },
  },
  {
    from: 'xlr',
    to: 'rca',
    reason: {
      en: 'Balanced to unbalanced: level drop and hum-loop exposure',
      ja: 'バランス→アンバランス。レベルが下がりハムループに晒される',
    },
  },
  {
    from: 'trs',
    to: 'rca',
    reason: {
      en: 'Balanced to unbalanced: level drop and hum-loop exposure',
      ja: 'バランス→アンバランス。レベルが下がりハムループに晒される',
    },
  },
  {
    from: 'rca',
    to: 'xlr',
    reason: {
      en: 'Unbalanced to balanced: the level is easily too low',
      ja: 'アンバランス→バランス。レベル不足になりやすい',
    },
  },
  {
    from: 'rca',
    to: 'trs',
    reason: {
      en: 'Unbalanced to balanced: the level is easily too low',
      ja: 'アンバランス→バランス。レベル不足になりやすい',
    },
  },
  {
    from: 'aes',
    to: 'xlr',
    reason: {
      en: 'AES/EBU is 110Ω, analogue XLR is a 600Ω system. Short runs work; they are not the same thing',
      ja: 'AES/EBU は 110Ω、アナログ XLR は 600Ω 系。短距離なら通るが厳密には別物',
    },
    symmetric: true,
  },
];

/** How to check one link. */
export interface CompatibilityOptions {
  /**
   * Language for any sentence this function composes itself.
   *
   * Table entries carry both languages and are chosen from later; the wording built around
   * them — "needs X, declare it with via" — is assembled here and has to pick one now.
   */
  locale?: Locale;
  /** Author-supplied rules from `compat` declarations. Consulted before every table. */
  overrides?: readonly CompatibilityRule[];
  /**
   * Whether the link declares a passive adapter with `via`.
   *
   * Declaring one clears the warning for pairings a cable can genuinely bridge, and is
   * ignored for pairings that need an active converter — `via` is documentation, not an
   * override. Use a `compat` rule when you really do mean to overrule kumihimo.
   */
  hasAdapter?: boolean;
}

function matchRule(rule: CompatibilityRule, from: string, to: string): boolean {
  if (rule.from === from && rule.to === to) return true;
  return (rule.symmetric ?? true) && rule.from === to && rule.to === from;
}

function matchLossy(pair: LossyPair, from: string, to: string): boolean {
  if (pair.from === from && pair.to === to) return true;
  return (pair.symmetric ?? false) && pair.from === to && pair.to === from;
}

function matchAdapter(adapter: PassiveAdapter, from: string, to: string): boolean {
  if (adapter.from === from && adapter.to === to) return true;
  return (adapter.symmetric ?? true) && adapter.from === to && adapter.to === from;
}

function result(
  verdict: CompatibilityVerdict,
  reason?: Localised,
  adapter?: Localised,
): CompatibilityResult {
  const out: CompatibilityResult = { verdict };
  if (reason !== undefined) out.reason = reason;
  if (adapter !== undefined) out.adapter = adapter;
  return out;
}

/**
 * Decide whether a link between two signal types is sound.
 *
 * Resolution order is: author overrides, identical types, connector confusions, passive
 * adapters, lossy pairs, interchangeable groups. Confusions are checked before the softer
 * tables so a shared connector can never be mistaken for genuine equivalence, and before
 * adapters so that `via` cannot paper over a link that no cable can fix.
 *
 * Anything no table covers falls through to `incompatible`. An unknown pairing is far
 * more likely to be a mistake than a clever piece of wiring, and a false warning costs
 * the author one `compat` line while a missed one costs a site visit.
 *
 * @param from - Signal type leaving the source port.
 * @param to - Signal type expected by the destination port.
 * @param options - Author overrides and whether the link declares an adapter.
 * @returns The verdict, the reason where a rule explains itself, and the adapter needed.
 */
export function checkCompatibility(
  from: SignalType,
  to: SignalType,
  options: CompatibilityOptions = {},
): CompatibilityResult {
  const { overrides = [], hasAdapter = false, locale = DEFAULT_LOCALE } = options;
  const a = from.name;
  const b = to.name;

  const override = overrides.find((rule) => matchRule(rule, a, b));
  if (override) return result(override.verdict, override.reason);

  if (a === b) return result('ok');

  // An unspecified signal matches anything. Warning about a cable the author has not
  // described yet would make sketching unusable.
  if (from.category === 'generic' || to.category === 'generic') return result('ok');

  // Air meets copper. No cable and no adapter bridges this — it takes a transmitter or a
  // receiver, which is a powered box and therefore belongs in the diagram as a device.
  if (from.wireless !== to.wireless) {
    const [air, wire] = from.wireless ? [from, to] : [to, from];
    return result('incompatible', {
      en: `${localise(air.label, locale)} is a radio path and cannot meet ${localise(wire.label, locale)} directly. Put the transmitter or receiver in as a device`,
      ja: `${localise(air.label, locale)} は無線区間なので ${localise(wire.label, locale)} に直結できない。送受信機を機器として配置すること`,
    });
  }

  const confusion = CONNECTOR_CONFUSIONS.find(
    (c) => (c.a === a && c.b === b) || (c.a === b && c.b === a),
  );
  if (confusion) {
    const why = localise(confusion.reason, locale);
    if (!hasAdapter) return result('incompatible', confusion.reason);
    // `via` was declared, and it does not help. Saying only "incompatible" here would read
    // as if the adapter had been overlooked, when the point is that no cable is the answer.
    return result('incompatible', {
      en: `${why}. A converting lead does not fix this; put a converter in as a device`,
      ja: `${why}。変換ケーブルでは解決しないため、変換器を機器として配置すること`,
    });
  }

  const adapter = PASSIVE_ADAPTERS.find((p) => matchAdapter(p, a, b));
  if (adapter) {
    if (hasAdapter) return result('ok', adapter.caveat, adapter.cable);

    const part = localise(adapter.cable, locale);
    const caveat = adapter.caveat ? localise(adapter.caveat, locale) : undefined;
    return result(
      'lossy',
      {
        en: `Needs ${part}${caveat ? `. ${caveat}` : ''}. Declare it with \`via\` and it lands on the parts list`,
        ja: `${part}が必要${caveat ? `。${caveat}` : ''}。via で明示すると資材表に載る`,
      },
      adapter.cable,
    );
  }

  const lossy = LOSSY_PAIRS.find((pair) => matchLossy(pair, a, b));
  if (lossy) return result('lossy', lossy.reason);

  if (sharesGroup(a, b)) return result('ok');

  return result('incompatible', {
    en: `${localise(from.label, locale)} and ${localise(to.label, locale)} cannot be joined by a cable. Put a converter in as a device`,
    ja: `${localise(from.label, locale)} と ${localise(to.label, locale)} は変換ケーブルでは接続できない。変換器を機器として配置すること`,
  });
}
