/**
 * Which language the command line answers in.
 */

import type { Locale } from '@love-rox/kumihimo-core';
import { LOCALES } from '@love-rox/kumihimo-core';

/**
 * Resolve a written locale, or fall back to the shell's.
 *
 * The environment is consulted rather than defaulting to English, because this command
 * predates the catalogue and its existing users are on Japanese machines. Switching them to
 * English on an upgrade would be a regression dressed as a feature.
 *
 * `LC_ALL` wins over `LC_MESSAGES`, which wins over `LANG` — the order POSIX defines. A
 * value like `ja_JP.UTF-8` is cut back to `ja`; anything the catalogue does not carry, and
 * the `C` and `POSIX` locales, land on English.
 *
 * @param written - A locale named on the command line, if one was.
 * @param env - Environment to read. Defaults to this process's.
 * @returns A locale the core recognises.
 */
export function resolveLocale(
  written?: string,
  env: Record<string, string | undefined> = process.env,
): Locale {
  const source = written ?? env['LC_ALL'] ?? env['LC_MESSAGES'] ?? env['LANG'] ?? '';
  const language = source.toLowerCase().split(/[_.@-]/)[0] ?? '';
  return LOCALES.find((l) => l === language) ?? 'en';
}
