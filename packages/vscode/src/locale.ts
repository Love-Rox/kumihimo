import type { Locale } from '@love-rox/kumihimo-core';
import { LOCALES } from '@love-rox/kumihimo-core';
import * as vscode from 'vscode';

/**
 * Which language the compiler should answer in.
 *
 * The editor's own language, not the operating system's and not a setting of ours. The
 * strings this extension owns are already picked by `vscode.l10n`, which follows
 * `vscode.env.language`; a compiler answering in a different language from the panel
 * around it would be worse than either language alone.
 *
 * VS Code reports a full tag — `ja`, `pt-br`, `zh-cn` — so the region is dropped and the
 * language matched. Anything the catalogue does not carry falls back to English, which is
 * what the core would have done anyway.
 *
 * @returns A locale the core recognises.
 */
export function editorLocale(): Locale {
  const language = vscode.env.language.toLowerCase().split('-')[0] ?? '';
  return LOCALES.find((l) => l === language) ?? 'en';
}
