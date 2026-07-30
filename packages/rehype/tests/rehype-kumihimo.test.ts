import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { describe, expect, it, vi } from 'vitest';

import { rehypeKumihimo } from '../src/rehype-kumihimo.js';
import type { RehypeKumihimoOptions } from '../src/rehype-kumihimo.js';

const SOURCE = `diagram "テスト" { direction: LR }
device cam "カメラ" as camera   { out SDI : sdi }
device sw  "SW"     as switcher { in 1..2 : sdi }
cam.SDI -&gt; sw.1 : sdi 10m "V-01"`;

/** Build the HTML a Markdown pipeline would hand to rehype for a fenced block. */
function fence(language: string, source = SOURCE): string {
  return `<pre><code class="language-${language}">${source}</code></pre>`;
}

async function run(html: string, options: RehypeKumihimoOptions = {}): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeKumihimo, options)
    .use(rehypeStringify)
    .process(html);
  return String(file);
}

describe('rehypeKumihimo', () => {
  it('replaces a kumihimo fence with an inline SVG', async () => {
    const html = await run(fence('kumihimo'));
    expect(html).toContain('<svg');
    expect(html).toContain('class="kumihimo"');
    expect(html).not.toContain('<pre>');
  });

  it('accepts the khm alias', async () => {
    expect(await run(fence('khm'))).toContain('<svg');
  });

  it('leaves other languages alone', async () => {
    const html = await run(fence('typescript', 'const a = 1;'));
    expect(html).toContain('<pre>');
    expect(html).not.toContain('<svg');
  });

  it('leaves a fence with no language alone', async () => {
    const html = await run('<pre><code>plain text</code></pre>');
    expect(html).toContain('<pre>');
  });

  it('renders the actual diagram content, not a placeholder', async () => {
    const html = await run(fence('kumihimo'));
    expect(html).toContain('カメラ');
    expect(html).toContain('V-01');
  });

  it('handles several blocks in one document', async () => {
    const html = await run(`${fence('kumihimo')}<p>間</p>${fence('khm')}`);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain('<p>間</p>');
  });

  it('keeps surrounding content in order when replacing', async () => {
    const html = await run(`<p>前</p>${fence('kumihimo')}<p>後</p>`);
    expect(html.indexOf('前')).toBeLessThan(html.indexOf('<svg'));
    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf('後'));
  });

  it('honours a custom language list', async () => {
    const html = await run(fence('wiring'), { languages: ['wiring'] });
    expect(html).toContain('<svg');
  });

  it('honours a custom wrapper class', async () => {
    const html = await run(fence('kumihimo'), { className: 'diagram' });
    expect(html).toContain('class="diagram"');
  });

  it('passes compile options through, so a theme applies', async () => {
    const html = await run(fence('kumihimo'), { theme: 'dark' });
    expect(html).toContain('#0f172a');
  });

  it('reports diagnostics rather than silently drawing a faulty system', async () => {
    const onDiagnostics = vi.fn();
    await run(
      fence(
        'kumihimo',
        `device a as generic { out CAT : hdbaset }
device b as router  { io  1..4 : lan }
a.CAT -&gt; b.1`,
      ),
      { onDiagnostics },
    );
    expect(onDiagnostics).toHaveBeenCalledOnce();
    const [diagnostics] = onDiagnostics.mock.calls[0]!;
    expect(diagnostics.some((d: { code: string }) => d.code === 'signal-mismatch')).toBe(true);
  });

  it('keeps the source block too when asked', async () => {
    const html = await run(fence('kumihimo'), { keepSource: true });
    expect(html).toContain('<pre>');
    expect(html).toContain('<svg');
  });

  it('still emits a diagram when the wiring is faulty', async () => {
    const html = await run(fence('kumihimo', 'a.X -&gt; b.Y'));
    expect(html).toContain('<svg');
  });

  it('produces SVG in the SVG namespace, not escaped text', async () => {
    const html = await run(fence('kumihimo'));
    expect(html).not.toContain('&lt;svg');
    expect(html).toContain('<polyline');
  });
});
