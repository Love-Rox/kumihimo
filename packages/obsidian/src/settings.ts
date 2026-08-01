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
};
