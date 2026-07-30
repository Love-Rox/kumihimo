#!/usr/bin/env node
/**
 * `kumihimo` command line entry point.
 */

import { watch } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { Command } from 'commander';

import { runBuild, runCheck } from './commands.js';

/** Default output path: the input with its extension swapped for `.svg`. */
function defaultOutput(file: string): string {
  const base = basename(file, extname(file));
  return join(file, '..', `${base}.svg`);
}

const program = new Command();

program
  .name('kumihimo')
  .description('映像・音響・制御・電源の系統図をテキストから描く')
  .version('0.0.0');

program
  .command('build', { isDefault: true })
  .description('.khm を SVG に変換する')
  .argument('<file>', '入力する .khm ファイル')
  .option('-o, --out <path>', '出力先の SVG。省略時は入力と同じ場所')
  .option('-d, --direction <dir>', 'レイアウト方向を上書きする (LR / TB)')
  .option('-t, --theme <name>', 'カラーテーマ (light / dark / mono / blueprint)')
  .option('--no-legend', '凡例を描かない')
  .option('--strict', '警告も失敗として扱う')
  .option('--no-color', '色を付けない')
  .option('-w, --watch', 'ファイルを監視して変更のたびに再生成する')
  .action(async (file: string, options: Record<string, unknown>) => {
    const out = (options['out'] as string | undefined) ?? defaultOutput(file);
    const direction = options['direction'] as string | undefined;
    const theme = options['theme'] as string | undefined;

    const once = async (): Promise<number> => {
      try {
        const result = await runBuild(file, {
          out,
          legend: options['legend'] !== false,
          strict: options['strict'] === true,
          color: options['color'] !== false,
          ...(theme ? { theme } : {}),
          ...(direction ? { options: { direction } } : {}),
        });
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
  .command('check')
  .description('.khm を検証する。SVG は書き出さない')
  .argument('<file>', '検証する .khm ファイル')
  .option('--strict', '警告も失敗として扱う')
  .option('--no-color', '色を付けない')
  .action(async (file: string, options: Record<string, unknown>) => {
    try {
      const result = await runCheck(file, {
        strict: options['strict'] === true,
        color: options['color'] !== false,
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
