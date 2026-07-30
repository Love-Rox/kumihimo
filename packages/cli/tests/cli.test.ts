import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBuild, runCheck } from '../src/commands.js';
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
    expect(result.report).toContain('問題は見つかりませんでした');
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

describe('formatting', () => {
  it('quotes the offending line and underlines the span', async () => {
    const { path } = await withFile(BROKEN);
    const { report } = await runCheck(path);
    expect(report).toContain('ext.CAT -> net.1');
    expect(report).toContain('~');
    expect(report).toContain('Ethernet ではない');
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
        { code: 'parse-error', severity: 'error', message: 'a' },
        { code: 'signal-mismatch', severity: 'warning', message: 'b' },
        { code: 'signal-mismatch', severity: 'warning', message: 'c' },
      ]),
    ).toEqual({ errors: 1, warnings: 2, infos: 0 });
  });

  it('formats a diagnostic without a span', () => {
    const text = formatDiagnostic({ code: 'parse-error', severity: 'error', message: 'だめ' });
    expect(text).toContain('だめ');
    expect(text).toContain('parse-error');
  });

  it('says so when there is nothing to report', () => {
    expect(formatReport([])).toContain('問題は見つかりませんでした');
  });
});
