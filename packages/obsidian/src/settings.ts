/** What the plugin remembers between sessions. */

/** The settings this plugin keeps. */
export interface KumihimoSettings {
  /**
   * Theme to draw with.
   *
   * A `diagram { theme: … }` inside the block wins over this: the note is the document, and
   * a drawing that specifies its own look is saying something about that drawing rather
   * than about the vault.
   */
  theme: 'light' | 'dark' | 'mono' | 'blueprint';
  /** Whether the schedules appear, folded up, under each drawing. */
  showSchedules: boolean;
  /**
   * Language for the headings, the schedule names and the compiler's own messages.
   *
   * A setting rather than a reading of the app's interface language. Obsidian keeps that in
   * `localStorage`, and reaching into it is both reaching past the plugin data API and
   * assuming somebody wants their diagrams in the language their menus are in — which is
   * not the same question. This asks the question it means.
   */
  locale: 'en' | 'ja';
}

/**
 * Where a vault starts.
 *
 * `light` rather than following the app's theme: a diagram is dark ink on paper, and a note
 * read in dark mode still gets printed, pasted and screenshotted onto white. Somebody who
 * wants otherwise says so once.
 */
export const DEFAULT_SETTINGS: KumihimoSettings = {
  theme: 'light',
  showSchedules: true,
  locale: 'en',
};
