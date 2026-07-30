import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Kumihimo } from '../src/Kumihimo.js';

const SOURCE = `
diagram "テスト" { direction: LR }
device cam "カメラ" as camera   { out SDI : sdi }
device sw  "SW"     as switcher { in 1..2 : sdi }
cam.SDI -> sw.1 : sdi 10m "V-01"
`;

/** The rendered SVG element, once one exists. */
async function svgOf(container: HTMLElement): Promise<SVGElement> {
  return waitFor(() => {
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    return svg!;
  });
}

describe('Kumihimo', () => {
  it('renders a diagram from source', async () => {
    const { container } = render(<Kumihimo source={SOURCE} />);
    const svg = await svgOf(container);
    expect(svg.textContent).toContain('カメラ');
    expect(svg.textContent).toContain('V-01');
  });

  it('shows a fallback until the first diagram is ready', () => {
    render(<Kumihimo source={SOURCE} fallback={<span>読み込み中</span>} />);
    // Compiling is asynchronous, so the fallback is what the first paint shows.
    expect(screen.getByText('読み込み中')).toBeTruthy();
  });

  it('applies the wrapper class', async () => {
    const { container } = render(<Kumihimo source={SOURCE} className="diagram" />);
    await svgOf(container);
    expect(container.querySelector('.diagram')).not.toBeNull();
  });

  it('passes compile options through, so a theme applies', async () => {
    const { container } = render(<Kumihimo source={SOURCE} theme="dark" />);
    const svg = await svgOf(container);
    expect(svg.innerHTML).toContain('#0f172a');
  });

  it('reports diagnostics rather than silently drawing faulty wiring', async () => {
    const onDiagnostics = vi.fn();
    render(
      <Kumihimo
        source={`device a as generic { out CAT : hdbaset }
                 device b as router  { io  1..4 : lan }
                 a.CAT -> b.1`}
        onDiagnostics={onDiagnostics}
      />,
    );
    await waitFor(() => expect(onDiagnostics).toHaveBeenCalled());
    const [diagnostics] = onDiagnostics.mock.calls[0]!;
    expect(diagnostics.some((d: { code: string }) => d.code === 'signal-mismatch')).toBe(true);
  });

  it('redraws when the source changes', async () => {
    const { container, rerender } = render(<Kumihimo source={SOURCE} />);
    await waitFor(() => expect(container.querySelector('svg')?.textContent).toContain('カメラ'));

    rerender(<Kumihimo source={SOURCE.replace('カメラ', 'ビデオカメラ')} />);
    await waitFor(() =>
      expect(container.querySelector('svg')?.textContent).toContain('ビデオカメラ'),
    );
  });

  it('keeps the previous diagram on screen while recompiling', async () => {
    const { container, rerender } = render(<Kumihimo source={SOURCE} />);
    await svgOf(container);

    // A recompile must not blank the panel — that is what makes live editing bearable.
    rerender(<Kumihimo source={`${SOURCE}\ndevice extra as generic`} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('still draws when the wiring is faulty', async () => {
    const { container } = render(<Kumihimo source="a.X -> b.Y" />);
    await svgOf(container);
  });

  it('does not recompile when an inline options object is re-created', async () => {
    // Options are compared by content, not identity, or every render would recompile.
    const onDiagnostics = vi.fn();
    const { rerender } = render(
      <Kumihimo source="a.X -> b.Y" legend={false} onDiagnostics={onDiagnostics} />,
    );
    await waitFor(() => expect(onDiagnostics).toHaveBeenCalled());
    const first = onDiagnostics.mock.calls.length;

    rerender(<Kumihimo source="a.X -> b.Y" legend={false} onDiagnostics={onDiagnostics} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onDiagnostics.mock.calls.length).toBe(first);
  });
});
