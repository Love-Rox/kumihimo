/**
 * The translation itself, rather than the wording of the default.
 *
 * Every other test in this suite asserts English, because English is what a caller gets
 * when it names no locale. These assert that a caller who *does* name one is answered in
 * it, end to end — through the parser, the builder, the compatibility tables, the legend
 * and the schedules — and that the machine-readable half of a diagnostic survives.
 */

import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import { checkCompatibility } from '../src/compatibility.js';
import { compile } from '../src/compile.js';
import { DiagnosticBag } from '../src/diagnostics.js';
import { loadDocument } from '../src/loader.js';
import type { Locale } from '../src/messages.js';
import { DEFAULT_LOCALE, LOCALES, MESSAGES, formatMessage, localise } from '../src/messages.js';
import { parse } from '../src/parser.js';
import { adapterSchedule, cableSchedule } from '../src/schedule.js';
import { BUILTIN_SIGNALS } from '../src/signals.js';

function sig(name: string) {
  const s = BUILTIN_SIGNALS[name];
  if (!s) throw new Error(`missing builtin signal: ${name}`);
  return s;
}

/** A source with one unconnected port, so it always produces the same diagnostic. */
const UNCONNECTED = [
  'device a { out X : sdi',
  'out Y : sdi }',
  'device b { in Z : sdi }',
  'a.X -> b.Z : sdi',
].join('\n');

/** The `{name}` holes in a template, sorted so two languages can be compared. */
const placeholders = (template: string) =>
  [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).toSorted();

describe('the catalogue', () => {
  it('says English by default', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('carries every locale for every key', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      for (const locale of LOCALES) {
        expect(entry[locale], `${key} is missing ${locale}`).toBeTruthy();
      }
    }
  });

  it('keeps the same placeholders in every language', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      const expected = placeholders(entry.en);
      for (const locale of LOCALES) {
        expect(placeholders(entry[locale]), `${key} in ${locale}`).toEqual(expected);
      }
    }
  });

  it('leaves a placeholder standing when no value was supplied', () => {
    // Better a visible `{id}` than a sentence with a hole in it.
    expect(formatMessage('port.unconnected', {})).toBe('Wired to nothing: {id}');
  });

  it('falls back to English for a locale the entry does not carry', () => {
    expect(localise({ en: 'cable' }, 'ja')).toBe('cable');
  });

  it('passes a string the author wrote through untouched', () => {
    expect(localise('社内標準のケーブル', 'en')).toBe('社内標準のケーブル');
  });
});

describe('diagnostics carry their key as well as their sentence', () => {
  it('reports the key and the values that filled it', () => {
    const bag = new DiagnosticBag({ 'unconnected-port': 'warning' });
    bag.report('unconnected-port', 'port.unconnected', { id: 'a.Y' });
    const [hit] = bag.all;
    expect(hit?.key).toBe('port.unconnected');
    expect(hit?.params).toEqual({ id: 'a.Y' });
  });

  it('lets a caller re-render a diagnostic in another language', () => {
    // This is the point of keeping the key: an editor can hold one compile and still
    // answer a reader who changed language, without recompiling.
    const { diagnostics } = buildModel(parse(UNCONNECTED).document, {
      severities: { 'unconnected-port': 'warning' },
    });
    const hit = diagnostics.find((d) => d.code === 'unconnected-port');
    expect(hit?.message).toBe('Wired to nothing: a.Y');
    expect(formatMessage(hit!.key, hit!.params, 'ja')).toBe('どこにも結線されていません: a.Y');
  });
});

describe('every stage answers in the locale it was given', () => {
  it('parses in Japanese', () => {
    const { diagnostics } = parse('device', { locale: 'ja' });
    expect(diagnostics[0]?.message).toContain('が必要です');
  });

  it('translates the noun inside the sentence, not only the sentence', () => {
    // The failure this guards: a translated template with an untranslated value dropped
    // into it, which type-checks and reads as "オプション名 is required".
    expect(parse('diagram { 3').diagnostics[0]?.message).toBe('An option name is required');
    expect(parse('diagram { 3', { locale: 'ja' }).diagnostics[0]?.message).toBe(
      'オプション名が必要です',
    );
  });

  it('builds in Japanese', () => {
    const { diagnostics } = buildModel(parse(UNCONNECTED).document, {
      severities: { 'unconnected-port': 'warning' },
      locale: 'ja',
    });
    expect(diagnostics.map((d) => d.message)).toEqual(['どこにも結線されていません: a.Y']);
  });

  it('loads in Japanese', async () => {
    const { diagnostics } = await loadDocument('use "lib.khm"', { locale: 'ja' });
    expect(diagnostics[0]?.message).toContain('resolver');
    expect(diagnostics[0]?.message).toContain('取り込みを解決できません');
  });

  it('checks compatibility in Japanese', () => {
    const r = checkCompatibility(sig('hdbaset'), sig('lan'), { locale: 'ja' });
    expect(localise(r.reason!, 'ja')).toContain('Ethernet ではない');
  });

  it('names signals in Japanese in the legend', async () => {
    const source =
      'device a as generic { out RF : uhf }\ndevice b as generic { in RF : uhf }\na.RF -> b.RF';
    const en = await compile(source);
    const ja = await compile(source, { locale: 'ja' });
    expect(en.svg).toContain('Wireless (UHF)');
    expect(ja.svg).toContain('ワイヤレス (UHF)');
  });
});

describe('schedules', () => {
  const SOURCE = `
    device pc as computer { out HDMI : hdmi }
    device mon as display { in DVI : dvi }
    pc.HDMI -> mon.DVI
  `;

  function diagramOf(locale: Locale) {
    return buildModel(parse(SOURCE).document, { locale }).diagram;
  }

  it('names the part in the language asked for', () => {
    expect(cableSchedule(diagramOf('en'))[0]?.adapter).toBe('HDMI-DVI cable');
    expect(cableSchedule(diagramOf('ja'), 'ja')[0]?.adapter).toBe('HDMI-DVI 変換ケーブル');
  });

  it('counts a part under one name, whichever language that is', () => {
    // The part name is the grouping key, so a schedule that mixed languages would count
    // the same adapter twice under two spellings. A run whose ends agree, because a
    // converting lead is the cable itself and belongs on the other schedule.
    const source = [
      'device cam as camera  { out SDI : sdi }',
      'device mon as display { in SDI : sdi }',
      'cam.SDI -> mon.SDI : sdi 30m "V-01" via "BNC-RCA 変換"',
    ].join('\n');
    const diagram = buildModel(parse(source).document, { locale: 'ja' }).diagram;

    const rows = adapterSchedule(diagram, 'ja');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adapter).toBe('BNC-RCA 変換');
  });
});
