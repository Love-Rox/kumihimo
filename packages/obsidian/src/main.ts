/**
 * kumihimo in Obsidian: a ```kumihimo block becomes the diagram it describes.
 *
 * The whole compiler runs here. Obsidian's renderer is Electron's, and the layout engine
 * turns out to need nothing from Node — it builds no worker and runs with `Worker` removed
 * entirely, which was the one thing worth checking before writing any of this.
 *
 * Notes are read far more often than they are edited, so the block renders to a picture and
 * says what is wrong underneath rather than opening an editor. What a note wants from a
 * drawing is the same thing paper wants: to be looked at.
 */

import type { Diagnostic } from '@love-rox/kumihimo-core';
import { compile, readableSchedules } from '@love-rox/kumihimo-core';
import {
  MarkdownRenderChild,
  Plugin,
  PluginSettingTab,
  Setting,
  sanitizeHTMLToDom,
} from 'obsidian';

import type { KumihimoSettings } from './settings.js';
import { DEFAULT_SETTINGS } from './settings.js';

/** The word that opens a block: ```kumihimo, and ```khm for the same reason the CLI has both. */
const FENCES = ['kumihimo', 'khm'] as const;

export default class KumihimoPlugin extends Plugin {
  override settings: KumihimoSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<KumihimoSettings>),
    };
    this.addSettingTab(new KumihimoSettingTab(this));

    for (const fence of FENCES) {
      this.registerMarkdownCodeBlockProcessor(fence, (source, element, context) => {
        // A render child rather than a bare await: Obsidian tears these down when a note is
        // closed mid-render, and a promise that resolves afterwards would write into an
        // element that is no longer on the page.
        const child = new DiagramBlock(element, source, this);
        context.addChild(child);
      });
    }
  }

  /** Save, and redraw every block that is currently on screen. */
  async save(): Promise<void> {
    await this.saveData(this.settings);
    // Obsidian has no "re-run the processors" call, so the leaves are asked to rebuild.
    this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      const view = leaf.view as { previewMode?: { rerender?: (full: boolean) => void } };
      view.previewMode?.rerender?.(true);
    });
  }
}

/**
 * One block, from source to picture.
 *
 * Compiling is asynchronous, so the element has to survive the wait — {@link onunload} is
 * the signal that it did not.
 */
class DiagramBlock extends MarkdownRenderChild {
  #alive = true;

  constructor(
    element: HTMLElement,
    private readonly source: string,
    private readonly plugin: KumihimoPlugin,
  ) {
    super(element);
  }

  override onload(): void {
    void this.draw();
  }

  override onunload(): void {
    this.#alive = false;
  }

  private async draw(): Promise<void> {
    const { theme, showSchedules, locale } = this.plugin.settings;

    let svg: string;
    let diagnostics: readonly Diagnostic[];
    let diagram;
    try {
      const result = await compile(this.source, { theme, locale });
      ({ svg, diagnostics, diagram } = result);
    } catch (error) {
      // compile() is documented never to throw. If that ever stops being true, the note
      // says so rather than showing an empty box and leaving the author guessing.
      if (!this.#alive) return;
      this.containerEl.empty();
      this.containerEl.createEl('pre', {
        cls: 'kumihimo-error',
        text: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!this.#alive) return;

    const root = this.containerEl;
    root.empty();
    root.addClass('kumihimo');

    // `sanitizeHTMLToDom` rather than innerHTML. The drawing is built from text in this
    // vault, which is usually the reader's own — but a note can arrive from anywhere, and
    // Obsidian ships the sanitiser precisely so a plugin does not have to decide.
    const figure = root.createDiv({ cls: 'kumihimo-diagram' });
    figure.appendChild(sanitizeHTMLToDom(svg));

    if (diagnostics.length > 0) {
      const list = root.createEl('ul', { cls: 'kumihimo-diagnostics' });
      for (const diagnostic of diagnostics) {
        const item = list.createEl('li', { cls: `kumihimo-${diagnostic.severity}` });
        item.createSpan({ cls: 'kumihimo-severity', text: diagnostic.severity });
        item.createSpan({ cls: 'kumihimo-code', text: diagnostic.code });
        item.createSpan({ text: diagnostic.message });
      }
    }

    if (showSchedules) {
      for (const sheet of readableSchedules(diagram, locale)) {
        const details = root.createEl('details', { cls: 'kumihimo-schedule' });
        details.createEl('summary', { text: `${sheet.title} (${sheet.rows.length})` });
        const table = details.createEl('table');
        const headRow = table.createEl('thead').createEl('tr');
        for (const heading of sheet.head) headRow.createEl('th', { text: heading });
        const body = table.createEl('tbody');
        for (const row of sheet.rows) {
          const tr = body.createEl('tr');
          for (const cell of row) tr.createEl('td', { text: cell });
        }
      }
    }
  }
}

/**
 * The settings, described rather than drawn.
 *
 * `getSettingDefinitions` is how Obsidian 1.13 and later index a plugin's settings for the
 * global search — a tab that only draws itself is a tab whose settings nobody can find by
 * typing their name. It also does the reading and saving, so there is no `onChange` to get
 * wrong.
 *
 * `display()` stays beside it because 1.13 is an insider build and `minAppVersion` here is
 * 1.7.2. On an older Obsidian the declarative method is simply never called, and the tab
 * draws itself the way it always did. Dropping `display()` would have been dropping every
 * version anybody is actually running today.
 */
class KumihimoSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: KumihimoPlugin) {
    super(plugin.app, plugin);
  }

  /** Cheap on purpose: this runs on every update and once at registration. */
  override getSettingDefinitions() {
    return [
      {
        name: 'Theme',
        desc: 'A `diagram { theme: … }` in the block wins over this.',
        control: {
          type: 'dropdown' as const,
          key: 'theme',
          options: { light: 'light', dark: 'dark', mono: 'mono', blueprint: 'blueprint' },
        },
      },
      {
        name: 'Language',
        desc: 'For the headings, the schedule names and the compiler’s messages.',
        control: {
          type: 'dropdown' as const,
          key: 'locale',
          options: { en: 'English', ja: '日本語' },
        },
      },
      {
        name: 'Show the schedules',
        desc: 'The cable, wireless, equipment and parts lists, folded up under the drawing.',
        control: { type: 'toggle' as const, key: 'showSchedules' },
      },
    ];
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Theme')
      .setDesc('A `diagram { theme: … }` in the block wins over this.')
      .addDropdown((drop) => {
        for (const name of ['light', 'dark', 'mono', 'blueprint']) drop.addOption(name, name);
        drop.setValue(this.plugin.settings.theme).onChange(async (value) => {
          this.plugin.settings.theme = value as KumihimoSettings['theme'];
          await this.plugin.save();
        });
      });

    new Setting(containerEl)
      .setName('Language')
      .setDesc('For the headings, the schedule names and the compiler’s messages.')
      .addDropdown((drop) => {
        drop.addOption('en', 'English');
        drop.addOption('ja', '日本語');
        drop.setValue(this.plugin.settings.locale).onChange(async (value) => {
          this.plugin.settings.locale = value as KumihimoSettings['locale'];
          await this.plugin.save();
        });
      });

    new Setting(containerEl)
      .setName('Show the schedules')
      .setDesc('The cable, wireless, equipment and parts lists, folded up under the drawing.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showSchedules).onChange(async (value) => {
          this.plugin.settings.showSchedules = value;
          await this.plugin.save();
        });
      });
  }
}
