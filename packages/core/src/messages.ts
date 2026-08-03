/**
 * Every sentence this compiler can say, in every language it can say it in.
 *
 * Messages live here rather than at the point they are reported, because a diagnostic is
 * read by someone who did not write the compiler and may not read Japanese. Reporting sites
 * name a key and supply values; the wording is chosen last, by whoever is looking.
 *
 * English is the default. The specification is written in English and the packages are
 * published with English READMEs, and a library that answers in a language the caller never
 * asked for has decided who its users are.
 */

/** A language messages can be rendered in. */
export type Locale = 'en' | 'ja';

/** Every locale the catalogue covers. */
export const LOCALES: readonly Locale[] = ['en', 'ja'];

/** The locale used when a caller names none. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Values substituted into a message template. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * A string that may be written once, or once per language.
 *
 * Built-in tables carry both. A reason an author writes in their own `compat` declaration is
 * whatever they typed, and translating it is not this library's business.
 */
export type Localised = string | Readonly<Partial<Record<Locale, string>>>;

/** Pick a language out of a {@link Localised}, falling back to English. */
export function localise(value: Localised, locale: Locale = DEFAULT_LOCALE): string {
  if (typeof value === 'string') return value;
  return value[locale] ?? value[DEFAULT_LOCALE] ?? '';
}

/** The catalogue. Keys name the stage that says the sentence, then the sentence. */
export const MESSAGES = {
  // ── parser ────────────────────────────────────────────────────────────────
  'parse.expected': { en: '{what} is required', ja: '{what}が必要です' },
  'parse.value': { en: 'A value is required', ja: '値が必要です' },
  'parse.attr-unquoted': {
    en: 'A value with a space in it goes in quotes: `{key}="{value} …"`',
    ja: '空白を含む値は引用符で囲みます: `{key}="{value} …"`',
  },
  'parse.port-name': { en: 'A port name is required', ja: 'ポート名が必要です' },
  'parse.arrow': { en: '`->` is required', ja: '`->` が必要です' },
  'parse.any-arrow': {
    en: 'One of `->`, `<->` or `--` is required',
    ja: '`->` / `<->` / `--` のいずれかが必要です',
  },
  'parse.device-body': {
    en: 'One of `in`, `out`, `io`, `gap` or `@key` is required',
    ja: '`in` / `out` / `io` / `gap` / `@キー` のいずれかが必要です',
  },
  'parse.gap-count': {
    en: 'The count after `gap` must be 1 or more',
    ja: '`gap` の数は 1 以上が必要です',
  },
  'parse.statement': {
    en: 'This is not the start of a statement',
    ja: '文の先頭が解釈できません',
  },
  'parse.token': { en: 'Unreadable token: {token}', ja: '解釈できない字句: {token}' },

  // ── ranges and port specs ─────────────────────────────────────────────────
  'range.integer': {
    en: 'The bounds of a range must be whole numbers',
    ja: '範囲の端は整数である必要があります',
  },
  'range.order': {
    en: 'Range {from}..{to} starts after it ends',
    ja: '範囲 {from}..{to} は始端が終端より大きい',
  },
  'range.too-large': {
    en: 'Range {from}..{to} is too large (limit {limit})',
    ja: '範囲 {from}..{to} が大きすぎます (上限 {limit})',
  },
  'ports.count-mismatch': {
    en: 'The two ends name different numbers of ports ({left} against {right})',
    ja: '両端のポート数が一致しません ({left} 対 {right})',
  },

  // ── declarations ──────────────────────────────────────────────────────────
  'value.direction': {
    en: 'direction is LR or TB: {value}',
    ja: 'direction は LR か TB のいずれかです: {value}',
  },
  'value.order': {
    en: 'order is `fixed`: {value}',
    ja: 'order に書けるのは `fixed` です: {value}',
  },
  'value.category': { en: 'Unknown category: {value}', ja: '未知のカテゴリ: {value}' },
  'value.colour': { en: 'Not a colour: {value}', ja: '色として解釈できません: {value}' },
  'value.width': {
    en: 'width is a positive number: {value}',
    ja: 'width は正の数値です: {value}',
  },
  'value.style': {
    en: 'style is solid, dashed or dotted: {value}',
    ja: 'style は solid / dashed / dotted です: {value}',
  },
  'value.signal-option': {
    en: 'Unknown signal option: {key}',
    ja: '未知の signal オプション: {key}',
  },
  'value.verdict': {
    en: 'A verdict is ok, lossy or incompatible: {value}',
    ja: '判定は ok / lossy / incompatible のいずれかです: {value}',
  },

  // ── devices, ports and models ─────────────────────────────────────────────
  'device.duplicate-id': {
    en: 'Duplicate device id: {id}',
    ja: '機器 id が重複しています: {id}',
  },
  'device.unknown-kind': { en: 'Unknown device kind: {kind}', ja: '未知の機器種別: {kind}' },
  'device.implicit': {
    en: 'Undeclared device referenced: {id}',
    ja: '宣言されていない機器を参照しています: {id}',
  },
  'device.unknown-model': {
    en: 'No model named {name} was declared',
    ja: '未定義のモデルです: {name}',
  },
  'port.implicit': {
    en: 'Undeclared port referenced: {id}',
    ja: '宣言されていないポートを参照しています: {id}',
  },
  'port.generated': {
    en: 'No port was named, so {id} was created',
    ja: 'ポートが指定されていないため {id} を生成しました',
  },
  'port.unconnected': { en: 'Wired to nothing: {id}', ja: 'どこにも結線されていません: {id}' },
  'port.attr-unknown': {
    en: '{name} is not something a port understands. The only one is `connector`',
    ja: '{name} は口が解釈しない属性です。使えるのは `connector` だけです',
  },
  'port.connector-unknown': {
    en: '{name} is not a connector {signal} uses. Try one of: {expected}',
    ja: '{name} は {signal} のコネクタではありません。次のいずれかです: {expected}',
  },
  'port.connector-needs-signal': {
    en: 'A connector can only be named on a port that names a signal type',
    ja: 'コネクタを書けるのは、信号種別を書いた口だけです',
  },
  'signal.unknown': { en: 'Unknown signal type: {name}', ja: '未定義の信号種別: {name}' },

  // ── connections ───────────────────────────────────────────────────────────
  'link.direction-out': {
    en: '{id} is an input, so nothing can leave it',
    ja: '{id} は入力ポートなので送出できません',
  },
  'link.direction-in': {
    en: '{id} is an output, so nothing can arrive at it',
    ja: '{id} は出力ポートなので受けられません',
  },
  'link.overbooked': {
    en: '{id} has more than one source wired into it',
    ja: '{id} に複数の入力が結線されています',
  },
  'link.duplicate': {
    en: 'The same connection is written twice: {pair}',
    ja: '同じ結線が重複しています: {pair}',
  },
  'link.verdict': { en: '{from} → {to}: {reason}', ja: '{from} → {to}: {reason}' },
  'adapter.two-ended': {
    en: 'Every end of {id} is moulded on, so it is one cable rather than a junction. Write it as `via` on the run it sits in — or give a run a length or a cable number, if something plugs into it',
    ja: '{id} はすべての端が一体なので、分岐ではなく1本のケーブルです。その結線に `via` で書いてください。差し込む口があるなら、その結線に長さかケーブル番号を書いてください',
  },
  'link.wireless-via': {
    en: 'A radio path cannot have an adapter in it',
    ja: '無線区間に変換ケーブルは挟めません',
  },
  'link.wireless-length': {
    en: 'A radio path has no cable length: {value}',
    ja: '無線区間にケーブル長は指定できません: {value}',
  },
  'link.cabled-channel': {
    en: 'A cable has no channel or frequency: {key}={value}',
    ja: 'ケーブルにチャンネルや周波数は指定できません: {key}={value}',
  },

  // Fallbacks, for a verdict that arrived without a reason of its own.
  'verdict.mismatch': { en: 'the signal types disagree', ja: '信号種別が一致しません' },
  'verdict.caution': { en: 'this connection needs care', ja: '接続に注意が必要です' },

  // ── imports ───────────────────────────────────────────────────────────────
  'load.unresolved': { en: 'Cannot find {path}', ja: '取り込めません: {path}' },
  'load.no-resolver': {
    en: 'Cannot resolve {path}: no module resolver was supplied',
    ja: '取り込みを解決できません (resolver が指定されていません): {path}',
  },
  'load.nested': { en: '{path}: {message}', ja: '{path}: {message}' },
  'load.ignored': {
    en: '{path} declares {kinds}, which `use` does not bring in. It takes model, signal and compat only',
    ja: '{path} の {kinds} は取り込まれません。use が取り込むのは model / signal / compat のみです',
  },
} as const satisfies Record<string, Record<Locale, string>>;

/** Every key the catalogue knows. */
export type MessageKey = keyof typeof MESSAGES;

/**
 * Render a message.
 *
 * A placeholder with no matching value is left as written rather than blanked, so a missing
 * value shows up as `{id}` instead of as a sentence with a hole in it.
 *
 * @param key - Which sentence.
 * @param params - Values for its placeholders.
 * @param locale - Language to render in.
 * @returns The rendered sentence.
 */
export function formatMessage(
  key: MessageKey,
  params: MessageParams = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  const entry: Record<Locale, string> = MESSAGES[key];
  const template = entry[locale] ?? entry[DEFAULT_LOCALE];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
