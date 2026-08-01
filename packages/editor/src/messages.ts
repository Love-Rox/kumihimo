/**
 * The editor's own words.
 *
 * Separate from the compiler's catalogue because these belong to a different thing: the
 * compiler says what is wrong with a diagram, this says what the buttons do. Both follow
 * the same `locale`, so a page never mixes the two languages.
 */

import type { Locale } from '@love-rox/kumihimo-core';
import { DEFAULT_LOCALE } from '@love-rox/kumihimo-core';

const UI = {
  theme: { en: 'Theme', ja: 'テーマ' },
  rendering: { en: 'Drawing…', ja: '描画中…' },
  clean: { en: 'No problems', ja: '問題なし' },
  share: { en: 'Share URL', ja: 'URL 共有' },
  shared: { en: 'URL copied', ja: 'URL をコピーしました' },
  shareFailed: { en: 'Could not build a URL', ja: 'URL を作成できませんでした' },
  sourceLabel: { en: 'kumihimo source', ja: 'kumihimo ソース' },

  tabDiagram: { en: 'Diagram', ja: '図' },
  tabCable: { en: 'Cables', ja: 'ケーブル表' },
  tabEquipment: { en: 'Equipment', ja: '機器表' },
  tabAdapter: { en: 'Adapters', ja: '変換部材' },

  diagnostics: { en: 'Diagnostics', ja: '診断' },
  noProblems: { en: 'Nothing to report', ja: '問題は見つかりませんでした' },

  noDiagram: { en: 'No diagram yet', ja: 'まだ図がありません' },
  noRows: { en: 'Nothing here', ja: '該当なし' },

  // Download failures.
  svgLoadFailed: {
    en: 'The SVG could not be loaded as an image',
    ja: 'SVG を画像として読み込めませんでした',
  },
  canvasFailed: {
    en: 'The canvas could not be initialised',
    ja: 'canvas を初期化できませんでした',
  },
  pngFailed: { en: 'The PNG could not be produced', ja: 'PNG を生成できませんでした' },
} as const satisfies Record<string, Record<Locale, string>>;

/** Every string the editor shows. */
export type UiKey = keyof typeof UI;

/**
 * Look a string up.
 *
 * @param key - Which string.
 * @param locale - Language to render in.
 * @returns The string, in English if the locale carries no entry.
 */
export function t(key: UiKey, locale: Locale = DEFAULT_LOCALE): string {
  const entry: Record<Locale, string> = UI[key];
  return entry[locale] ?? entry[DEFAULT_LOCALE];
}
