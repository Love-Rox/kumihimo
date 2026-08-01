import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KumihimoEditor } from '../src/KumihimoEditor.js';
import { buildShareUrl, decodeSource, encodeSource, readSharedSource } from '../src/share.js';
import { sanitizeSvg } from '../src/sanitize.js';

// Vitest is not running with `globals: true`, so Testing Library's automatic
// cleanup is not registered and renders would otherwise pile up in one document.
afterEach(cleanup);
const SOURCE = `
diagram "テスト" { direction: LR }
device cam "カメラ" as camera   { out SDI : sdi }
device sw  "SW"     as switcher { in 1..2 : sdi }
cam.SDI -> sw.1 : sdi 10m "V-01"
`;

const FAULTY = `device ext "送信機" as converter { out CAT : hdbaset }
device net "SW" as router { io 1..4 : lan }
ext.CAT -> net.1`;

async function renderEditor(props: Record<string, unknown> = {}) {
  const view = render(<KumihimoEditor initialSource={SOURCE} readUrl={false} {...props} />);
  await waitFor(() => expect(view.container.querySelector('svg')).not.toBeNull());
  return view;
}

describe('KumihimoEditor', () => {
  it('draws the initial source', async () => {
    const { container } = await renderEditor();
    expect(container.querySelector('svg')?.textContent).toContain('カメラ');
  });

  it('redraws as the source is edited', async () => {
    const user = userEvent.setup();
    const { container } = await renderEditor({ initialSource: 'device a "元" as generic' });
    const box = screen.getByLabelText('kumihimo source');

    await user.clear(box);
    await user.type(box, 'device a "新" as generic');
    await waitFor(() => expect(container.querySelector('svg')?.textContent).toContain('新'));
  });

  it('reports the source back to the host', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    await renderEditor({ onChange });
    await user.type(screen.getByLabelText('kumihimo source'), '\n');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows a clean bill of health when there is nothing wrong', async () => {
    await renderEditor();
    await waitFor(() => expect(screen.getByText('Nothing to report')).toBeTruthy());
  });

  it('lists diagnostics for faulty wiring', async () => {
    await renderEditor({ initialSource: FAULTY });
    await waitFor(() => expect(screen.getByLabelText('Diagnostics')).toBeTruthy());
    expect(screen.getByText(/is not Ethernet/)).toBeTruthy();
  });

  it('moves the caret to the offending line when a diagnostic is clicked', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialSource: FAULTY });
    await waitFor(() => expect(screen.getByLabelText('Diagnostics')).toBeTruthy());

    await user.click(screen.getByText(/is not Ethernet/));

    const box = screen.getByLabelText('kumihimo source') as HTMLTextAreaElement;
    // The faulty link is the third line, so the selection must start beyond the first two.
    expect(box.selectionStart).toBeGreaterThan(FAULTY.indexOf('ext.CAT') - 1);
    expect(box.selectionEnd).toBeGreaterThan(box.selectionStart);
  });

  it('switches to the cable schedule and lists the run', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole('tab', { name: 'Cables' }));
    expect(screen.getByText('V-01')).toBeTruthy();
    expect(screen.getByText('10m')).toBeTruthy();
  });

  it('lists devices in the equipment schedule', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole('tab', { name: 'Equipment' }));
    expect(screen.getByText('switcher')).toBeTruthy();
  });

  it('applies a theme change to the drawing', async () => {
    const user = userEvent.setup();
    const { container } = await renderEditor();
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await waitFor(() => expect(container.innerHTML).toContain('#0f172a'));
  });
});

describe('locale', () => {
  it('puts its own words and the compiler’s in the same language', async () => {
    // The failure this guards: a panel labelled in one language listing faults in
    // another, which is what happens the moment the two are configured separately.
    const user = userEvent.setup();
    render(<KumihimoEditor initialSource={FAULTY} readUrl={false} locale="ja" />);

    await waitFor(() => expect(screen.getByLabelText('診断')).toBeTruthy());
    expect(screen.getByText(/Ethernet ではない/)).toBeTruthy();
    expect(screen.getByLabelText('テーマ')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'ケーブル表' }));
    expect(screen.getByText('信号')).toBeTruthy();
  });

  it('names the same part in the schedule as the compatibility check does', async () => {
    const user = userEvent.setup();
    render(
      <KumihimoEditor
        initialSource={
          'device pc as computer { out HDMI : hdmi }\n' +
          'device mon as display { in DVI : dvi }\n' +
          'pc.HDMI -> mon.DVI'
        }
        readUrl={false}
        locale="ja"
      />,
    );

    // On the cable schedule, not the parts list: the run *is* the converting lead, so a
    // second row would send someone to site with two objects for a job that needs one.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'ケーブル表' })).toBeTruthy());
    await user.click(screen.getByRole('tab', { name: 'ケーブル表' }));
    expect(screen.getByText('HDMI-DVI 変換ケーブル')).toBeTruthy();
  });
});

describe('share links', () => {
  it('round-trips source through a fragment value', async () => {
    const encoded = await encodeSource(SOURCE);
    expect(await decodeSource(encoded)).toBe(SOURCE);
  });

  it('round-trips through a whole URL', async () => {
    const url = await buildShareUrl(SOURCE, 'https://example.com/editor');
    expect(url).toContain('#src=');
    expect(await readSharedSource(url)).toBe(SOURCE);
  });

  it('keeps the source out of the query, where a server would see it', async () => {
    const url = new URL(await buildShareUrl(SOURCE, 'https://example.com/editor'));
    expect(url.search).toBe('');
    expect(url.hash.length).toBeGreaterThan(1);
  });

  it('survives Japanese text', async () => {
    const text = 'device 卓 "デジタル卓" as mixer';
    expect(await decodeSource(await encodeSource(text))).toBe(text);
  });

  it('returns nothing for a URL that carries no diagram', async () => {
    expect(await readSharedSource('https://example.com/')).toBeUndefined();
  });

  it('returns nothing rather than throwing on a mangled link', async () => {
    expect(await decodeSource('z!!!not-base64!!!')).toBeUndefined();
    expect(await decodeSource('')).toBeUndefined();
  });

  it('compresses, so a large diagram still fits in a URL', async () => {
    const big = Array.from({ length: 200 }, (_, i) => `a.X${i} -> b.Y${i} : sdi 10m`).join('\n');
    const encoded = await encodeSource(big);
    expect(encoded.length).toBeLessThan(big.length);
  });
});

describe('sanitizeSvg', () => {
  it('leaves a legitimate diagram untouched in substance', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><polyline points="1,2" stroke="#f00"/></svg>';
    const clean = sanitizeSvg(svg);
    expect(clean).toContain('<polyline');
    expect(clean).toContain('points="1,2"');
    expect(clean).toContain('stroke="#f00"');
  });

  it('drops an event handler attribute', () => {
    expect(sanitizeSvg('<svg onload="alert(1)"><g/></svg>')).not.toContain('onload');
  });

  it('drops an element the renderer cannot produce', () => {
    const clean = sanitizeSvg('<svg><script>alert(1)</script><g/></svg>');
    expect(clean).not.toContain('<script');
  });

  it('drops a foreignObject, which is how markup gets smuggled into SVG', () => {
    expect(sanitizeSvg('<svg><foreignObject><b>x</b></foreignObject></svg>')).not.toContain(
      'foreignObject',
    );
  });
});
