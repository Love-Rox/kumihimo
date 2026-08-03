import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Diagnostic, DiagnosticCode, Severity } from '@love-rox/kumihimo-core';
import { describe, expect, it } from 'vitest';

import { runBuild, runCheck } from '../src/commands.js';
import { runExport } from '../src/export.js';
import { resolveLocale } from '../src/locale.js';
import { formatDiagnostic, formatReport, summarize } from '../src/format.js';

const CLEAN = `
diagram "テスト" { direction: LR }
device cam "カメラ" as camera   { out SDI : sdi }
device sw  "SW"     as switcher { in 1..4 : sdi }
cam.SDI -> sw.1 : sdi 10m "V-01"
`;

const BROKEN = `
device ext "送信機" as converter { out CAT : hdbaset }
device net "SW"     as router    { io  1..4 : lan }
ext.CAT -> net.1
`;

async function withFile(source: string, name = 'test.khm') {
  const dir = await mkdtemp(join(tmpdir(), 'kumihimo-'));
  const path = join(dir, name);
  await writeFile(path, source, 'utf8');
  return { dir, path };
}

describe('runBuild', () => {
  it('writes an SVG and reports a clean run', async () => {
    const { dir, path } = await withFile(CLEAN);
    const out = join(dir, 'out.svg');
    const result = await runBuild(path, { out });

    expect(result.exitCode).toBe(0);
    expect(result.written).toBe(out);
    expect(await readFile(out, 'utf8')).toContain('<svg');
    expect(result.report).toContain('Nothing to report');
  });

  it('lays the drawing out the way `-d` asked', async () => {
    // `-d` was documented in `--help` and did nothing: it arrived as an `options` bag no
    // build option declared, so it type-checked and was dropped. Nothing noticed, because
    // nothing here looked at the shape of what came out.
    const bare = CLEAN.replace('diagram "テスト" { direction: LR }', '');
    const { dir, path } = await withFile(bare);

    const wide = join(dir, 'lr.svg');
    const tall = join(dir, 'tb.svg');
    await runBuild(path, { out: wide });
    await runBuild(path, { out: tall, direction: 'TB' });

    const box = async (file: string) => {
      const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(await readFile(file, 'utf8'));
      return { w: Number(m?.[1]), h: Number(m?.[2]) };
    };
    const lr = await box(wide);
    const tb = await box(tall);

    // The two compared against each other, not against a fixed size: a four-input switcher
    // is a tall box, so "wider than high" is not true of the LR drawing and asserting it
    // would be testing the node rather than the layout. What direction decides is which way
    // the *chain* runs, and that shows up as one drawing being wider and the other taller
    // than the same diagram laid out the other way.
    expect(lr.w).toBeGreaterThan(tb.w);
    expect(tb.h).toBeGreaterThan(lr.h);
  });

  it('lets a diagram that names its own direction keep it', async () => {
    // `CLEAN` says LR. A caller asking for TB is supplying a default, not an instruction —
    // so the drawing has to come out byte for byte the same as with no override at all.
    const { dir, path } = await withFile(CLEAN);
    const asked = join(dir, 'asked.svg');
    const alone = join(dir, 'alone.svg');
    await runBuild(path, { out: alone });
    await runBuild(path, { out: asked, direction: 'TB' });
    expect(await readFile(asked, 'utf8')).toBe(await readFile(alone, 'utf8'));
  });

  it('creates the output directory when it does not exist', async () => {
    const { dir, path } = await withFile(CLEAN);
    const out = join(dir, 'nested', 'deep', 'out.svg');
    await runBuild(path, { out });
    expect(await readFile(out, 'utf8')).toContain('<svg');
  });

  it('still writes a diagram when the wiring is faulty', async () => {
    const { dir, path } = await withFile(BROKEN);
    const out = join(dir, 'out.svg');
    const result = await runBuild(path, { out });

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(await readFile(out, 'utf8')).toContain('<svg');
  });

  it('passes on warnings by default but fails under --strict', async () => {
    const { path } = await withFile(BROKEN);
    expect((await runBuild(path)).exitCode).toBe(0);
    expect((await runBuild(path, { strict: true })).exitCode).toBe(1);
  });

  it('fails on an error regardless of strictness', async () => {
    const { path } = await withFile('device a\ndevice a');
    expect((await runBuild(path)).exitCode).toBe(1);
  });

  it('skips writing when no output is given', async () => {
    const { path } = await withFile(CLEAN);
    const result = await runBuild(path);
    expect(result.written).toBeUndefined();
    expect(result.svg).toContain('<svg');
  });

  it('reports a missing file rather than crashing silently', async () => {
    await expect(runBuild('/nonexistent/nope.khm')).rejects.toThrow();
  });
});

describe('runCheck', () => {
  it('validates without writing anything', async () => {
    const { path } = await withFile(BROKEN);
    const result = await runCheck(path);
    expect(result.written).toBeUndefined();
    expect(result.report).toContain('signal-mismatch');
  });
});

/**
 * A diagnostic built by hand, for the formatter's own tests.
 *
 * The formatter works on the shape rather than on where it came from, so these do not go
 * through a compile. `key` and `params` are what a caller re-renders a message from, so
 * they are required on the type and have to be supplied even here.
 */
function diagnostic(code: DiagnosticCode, severity: Severity, message: string): Diagnostic {
  return { code, severity, message, key: 'parse.statement', params: {} };
}

describe('formatting', () => {
  it('quotes the offending line and underlines the span', async () => {
    const { path } = await withFile(BROKEN);
    const { report } = await runCheck(path);
    expect(report).toContain('ext.CAT -> net.1');
    expect(report).toContain('~');
    expect(report).toContain('is not Ethernet');
  });

  it('includes file, line and column', async () => {
    const { path } = await withFile(BROKEN, 'wiring.khm');
    const { report } = await runCheck(path);
    expect(report).toMatch(/wiring\.khm:\d+:\d+/);
  });

  it('emits no escape codes unless colour is asked for', async () => {
    const { path } = await withFile(BROKEN);
    // eslint-disable-next-line no-control-regex
    expect((await runCheck(path, { color: false })).report).not.toMatch(/\[/);
    expect((await runCheck(path, { color: true })).report).toMatch(/\[/);
  });

  it('counts diagnostics by severity', () => {
    expect(
      summarize([
        diagnostic('parse-error', 'error', 'a'),
        diagnostic('signal-mismatch', 'warning', 'b'),
        diagnostic('signal-mismatch', 'warning', 'c'),
      ]),
    ).toEqual({ errors: 1, warnings: 2, infos: 0 });
  });

  it('formats a diagnostic without a span', () => {
    const text = formatDiagnostic(diagnostic('parse-error', 'error', 'Unreadable'));
    expect(text).toContain('Unreadable');
    expect(text).toContain('parse-error');
  });

  it('says so when there is nothing to report', () => {
    expect(formatReport([])).toContain('Nothing to report');
    expect(formatReport([], { locale: 'ja' })).toContain('問題は見つかりませんでした');
  });
});

describe('runExport', () => {
  it('writes a draw.io file', async () => {
    const { dir, path } = await withFile(CLEAN);
    const out = join(dir, 'out.drawio');
    const result = await runExport(path, 'drawio', { out });
    expect(result.written).toBe(out);
    expect(await readFile(out, 'utf8')).toContain('<mxfile');
  });

  it('writes an SVG', async () => {
    const { path } = await withFile(CLEAN);
    expect((await runExport(path, 'svg')).content).toContain('<svg');
  });

  it('writes a cable schedule as TSV with a header', async () => {
    const { path } = await withFile(CLEAN);
    const lines = (await runExport(path, 'cable')).content.split('\n');
    expect(lines[0]).toContain('label');
    expect(lines[1]).toContain('V-01');
  });

  it('writes an equipment schedule', async () => {
    const { path } = await withFile(CLEAN);
    expect((await runExport(path, 'equipment')).content).toContain('switcher');
  });

  it('writes an adapter schedule, empty when nothing needs one', async () => {
    const { path } = await withFile(CLEAN);
    // Header only.
    expect((await runExport(path, 'adapter')).content.split('\n')).toHaveLength(1);
  });

  it('returns content without writing when no output is given', async () => {
    const { path } = await withFile(CLEAN);
    const result = await runExport(path, 'drawio');
    expect(result.written).toBeUndefined();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('reports diagnostics alongside the export', async () => {
    const { path } = await withFile(BROKEN);
    expect((await runExport(path, 'drawio')).diagnostics.length).toBeGreaterThan(0);
  });
});

describe('resolveLocale', () => {
  it('takes what was written on the command line', () => {
    expect(resolveLocale('ja', {})).toBe('ja');
    expect(resolveLocale('en', { LANG: 'ja_JP.UTF-8' })).toBe('en');
  });

  it('falls back to the shell, so an upgrade does not change anyone’s language', () => {
    // This command shipped speaking Japanese. Defaulting to English on a Japanese machine
    // would read as a regression, whatever the library default is.
    expect(resolveLocale(undefined, { LANG: 'ja_JP.UTF-8' })).toBe('ja');
    expect(resolveLocale(undefined, { LC_ALL: 'ja_JP.UTF-8', LANG: 'en_GB' })).toBe('ja');
    expect(resolveLocale(undefined, { LC_MESSAGES: 'ja', LANG: 'en_GB' })).toBe('ja');
  });

  it('answers in English for anything the catalogue does not carry', () => {
    expect(resolveLocale(undefined, { LANG: 'pt_BR.UTF-8' })).toBe('en');
    expect(resolveLocale(undefined, { LANG: 'C' })).toBe('en');
    expect(resolveLocale(undefined, {})).toBe('en');
  });
});

describe('--version', () => {
  it('reports the version this package actually is', async () => {
    // It was the literal '0.0.0' for every release up to 0.3.0, so the flag answered 0.0.0
    // whatever was installed — and that is the number people put in bug reports.
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    const cli = await readFile(new URL('../src/cli.ts', import.meta.url), 'utf8');
    expect(cli).not.toContain(".version('0.0.0')");
    expect(manifest.version).not.toBe('0.0.0');
  });
});
