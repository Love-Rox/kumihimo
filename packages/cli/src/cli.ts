#!/usr/bin/env node
/**
 * `kumihimo` command line entry point.
 */

import { readFileSync, watch } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import type { FlowDirection } from '@love-rox/kumihimo-core';

import { STDIN, runBuild, runCheck, runFormat } from './commands.js';
import { resolveLocale } from './locale.js';
import type { ExportFormat } from './export.js';
import { EXPORT_EXTENSIONS, EXPORT_FORMATS, runExport } from './export.js';

/**
 * Read `-d`, or stop.
 *
 * An unrecognised direction used to be passed on and silently ignored, which is the worst
 * of the three possible outcomes: the drawing comes out the other way round and nothing
 * says why. `LR` and `TB` only, spelled in any case, the same as in the source.
 *
 * @param written - What was typed after `-d`, if anything.
 * @returns The direction, or `undefined` when none was asked for.
 */
function flowDirection(written?: string): FlowDirection | undefined {
  if (written === undefined) return undefined;
  const value = written.toUpperCase();
  if (value === 'LR' || value === 'TB') return value;
  console.error(`direction は LR か TB のいずれかです: ${written}`);
  process.exit(1);
}

/** Default output path: the input with its extension swapped for `.svg`. */
function defaultOutput(file: string): string {
  const base = basename(file, extname(file));
  return join(file, '..', `${base}.svg`);
}

/**
 * This command's own version, read from the package that ships it.
 *
 * It used to be the literal `'0.0.0'`, so `kumihimo --version` answered 0.0.0 whatever was
 * installed. That is worse than not offering the flag at all: the number it gives is the
 * one that ends up in a bug report.
 *
 * `src` and `dist` both sit one level under the package root, so the same relative path
 * works whether this is running from source or from the build.
 */
const version = ((): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  const manifest: unknown = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));
  return (manifest as { version?: string }).version ?? '0.0.0';
})();

const program = new Command();

program
  .name('kumihimo')
  .description('映像・音響・制御・電源の系統図をテキストから描く')
  .version(version);

program
  .command('build', { isDefault: true })
  .description('.khm を SVG に変換する')
  .argument('<file>', '入力する .khm ファイル。`-` で標準入力')
  .option('-o, --out <path>', '出力先の SVG。省略時は入力と同じ場所')
  .option('--stdout', 'ファイルに書かず SVG を標準出力に流す')
  .option('-d, --direction <dir>', 'レイアウト方向を上書きする (LR / TB)')
  .option('-t, --theme <name>', 'カラーテーマ (light / dark / mono / blueprint)')
  .option('--no-legend', '凡例を描かない')
  .option('--lang <code>', '診断の言語 (en / ja)。省略時は環境変数から')
  .option('--strict', '警告も失敗として扱う')
  .option('--no-color', '色を付けない')
  .option('-w, --watch', 'ファイルを監視して変更のたびに再生成する')
  .action(async (file: string, options: Record<string, unknown>) => {
    // A pipe has no name to derive an output path from, so it has to be told where to go.
    // Guessing `<stdin>.svg` in the working directory would be a file nobody asked for.
    const piped = file === STDIN;
    const toStdout = options['stdout'] === true;
    if (piped && !toStdout && options['out'] === undefined) {
      console.error('標準入力から読むときは --stdout か -o が要ります');
      process.exit(1);
    }
    const out = toStdout
      ? undefined
      : ((options['out'] as string | undefined) ?? defaultOutput(file));
    const direction = flowDirection(options['direction'] as string | undefined);
    const theme = options['theme'] as string | undefined;
    const locale = resolveLocale(options['lang'] as string | undefined);

    const once = async (): Promise<number> => {
      try {
        const result = await runBuild(file, {
          ...(out === undefined ? {} : { out }),
          legend: options['legend'] !== false,
          strict: options['strict'] === true,
          color: options['color'] !== false,
          locale,
          ...(theme ? { theme } : {}),
          ...(direction ? { direction } : {}),
        });
        if (toStdout) {
          // The drawing goes to stdout so it can be piped; the report goes to stderr so it
          // does not end up inside the SVG somebody is redirecting to a file.
          process.stdout.write(result.svg);
          if (result.report) console.error(result.report);
          return result.exitCode;
        }
        if (result.report) console.log(result.report);
        console.log(`→ ${result.written}`);
        return result.exitCode;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
      }
    };

    const code = await once();

    if (options['watch'] !== true) {
      process.exitCode = code;
      return;
    }

    console.log(`監視中: ${file}  (Ctrl-C で終了)`);
    let running = false;
    watch(file, () => {
      // fs.watch fires more than once per save on most platforms; a simple latch is
      // enough here because a rebuild is idempotent and cheap.
      if (running) return;
      running = true;
      setTimeout(() => {
        void once().finally(() => {
          running = false;
        });
      }, 50);
    });
  });

program
  .command('export')
  .description('.khm を別の形式で書き出す')
  .argument('<file>', '入力する .khm ファイル')
  .argument('[format]', `形式: ${EXPORT_FORMATS.join(' / ')}`, 'drawio')
  .option('-o, --out <path>', '出力先。省略時は入力と同じ場所')
  .option('-t, --theme <name>', 'カラーテーマ')
  .option('--lang <code>', '診断の言語 (en / ja)。省略時は環境変数から')
  .option('--stdout', 'ファイルに書かず標準出力に流す')
  .action(async (file: string, format: string, options: Record<string, unknown>) => {
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
      console.error(`未知の形式: ${format} (${EXPORT_FORMATS.join(' / ')})`);
      process.exitCode = 1;
      return;
    }
    const kind = format as ExportFormat;
    const theme = options['theme'] as string | undefined;
    const toStdout = options['stdout'] === true;
    const out = toStdout
      ? undefined
      : ((options['out'] as string | undefined) ??
        join(file, '..', `${basename(file, extname(file))}${EXPORT_EXTENSIONS[kind]}`));

    try {
      const result = await runExport(file, kind, {
        locale: resolveLocale(options['lang'] as string | undefined),
        ...(out === undefined ? {} : { out }),
        ...(theme ? { theme } : {}),
      });
      if (toStdout) {
        process.stdout.write(result.content);
      } else {
        console.log(`→ ${result.written}`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('fmt')
  .description('.khm を整形する')
  .argument('<file>', '整形する .khm ファイル')
  .option('--check', '書き換えず、整形済みかどうかだけを見る')
  .option('--stdout', 'ファイルを書き換えず標準出力に流す')
  .option('--indent <n>', '字下げ幅', '2')
  .option('--no-align', '桁を揃えない')
  .action(async (file: string, options: Record<string, unknown>) => {
    try {
      const result = await runFormat(file, {
        indent: Number.parseInt(String(options['indent'] ?? '2'), 10),
        align: options['align'] !== false,
        write: options['check'] !== true && options['stdout'] !== true,
      });

      if (options['stdout'] === true) {
        process.stdout.write(result.content);
        return;
      }
      if (options['check'] === true) {
        if (result.changed) {
          console.error(`整形されていません: ${file}`);
          process.exitCode = 1;
        }
        return;
      }
      console.log(result.changed ? `→ ${file}` : `変更なし: ${file}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('check')
  .description('.khm を検証する。SVG は書き出さない')
  .argument('<file>', '検証する .khm ファイル')
  .option('--lang <code>', '診断の言語 (en / ja)。省略時は環境変数から')
  .option('--strict', '警告も失敗として扱う')
  .option('--no-color', '色を付けない')
  .action(async (file: string, options: Record<string, unknown>) => {
    try {
      const result = await runCheck(file, {
        strict: options['strict'] === true,
        color: options['color'] !== false,
        locale: resolveLocale(options['lang'] as string | undefined),
      });
      console.log(result.report);
      process.exitCode = result.exitCode;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
