import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';

import { Kumihimo } from '../src/Kumihimo.js';

const SOURCE = `
diagram "テスト" { direction: LR }
device cam "カメラ" as camera   { out SDI : sdi }
device sw  "SW"     as switcher { in 1..2 : sdi }
cam.SDI -> sw.1 : sdi 10m "V-01"
`;

/**
 * Wait until a condition holds.
 *
 * `flushPromises` is not enough: the layout engine schedules work on the macrotask queue,
 * so the compile settles a tick or two after the microtask queue drains.
 */
async function until(check: () => boolean, timeout = 2000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the diagram');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();
    await nextTick();
  }
}

/** Props {@link Kumihimo} accepts, for the test helper's signature. */
type Props = InstanceType<typeof Kumihimo>['$props'];

/** Mount, wait for the first diagram, and hand back the wrapper. */
async function mountSettled(props: Props) {
  const wrapper = mount(Kumihimo, { props });
  await until(
    () => wrapper.html().includes('<svg') || wrapper.emitted('diagnostics') !== undefined,
  );
  await nextTick();
  return wrapper;
}

describe('Kumihimo', () => {
  it('renders a diagram from source', async () => {
    const wrapper = await mountSettled({ source: SOURCE });
    expect(wrapper.html()).toContain('<svg');
    expect(wrapper.text()).toContain('カメラ');
    expect(wrapper.text()).toContain('V-01');
  });

  it('applies the wrapper class', async () => {
    const wrapper = await mountSettled({ source: SOURCE, className: 'diagram' });
    expect(wrapper.find('.diagram').exists()).toBe(true);
  });

  it('applies a theme', async () => {
    const wrapper = await mountSettled({ source: SOURCE, theme: 'dark' });
    expect(wrapper.html()).toContain('#0f172a');
  });

  it('emits diagnostics rather than silently drawing faulty wiring', async () => {
    const wrapper = await mountSettled({
      source: `device a as generic { out CAT : hdbaset }
               device b as router  { io  1..4 : lan }
               a.CAT -> b.1`,
    });
    const emitted = wrapper.emitted('diagnostics');
    expect(emitted).toBeTruthy();
    const [diagnostics] = emitted![0] as [{ code: string }[]];
    expect(diagnostics.some((d) => d.code === 'signal-mismatch')).toBe(true);
  });

  it('redraws when the source changes', async () => {
    const wrapper = await mountSettled({ source: SOURCE });
    expect(wrapper.text()).toContain('カメラ');

    await wrapper.setProps({ source: SOURCE.replace('カメラ', 'ビデオカメラ') });
    await until(() => wrapper.text().includes('ビデオカメラ'));
    expect(wrapper.text()).toContain('ビデオカメラ');
  });

  it('keeps the previous diagram on screen while recompiling', async () => {
    const wrapper = await mountSettled({ source: SOURCE });
    await wrapper.setProps({ source: `${SOURCE}\ndevice extra as generic` });
    // No await: this is the instant right after the change, before the compile lands.
    expect(wrapper.html()).toContain('<svg');
  });

  it('still draws when the wiring is faulty', async () => {
    const wrapper = await mountSettled({ source: 'a.X -> b.Y' });
    expect(wrapper.html()).toContain('<svg');
  });

  it('tracks a reactive source', async () => {
    const source = ref(SOURCE);
    const wrapper = mount(Kumihimo, { props: { source: source.value } });
    await until(() => wrapper.html().includes('<svg'));
    await wrapper.setProps({ source: 'device solo "単体" as generic' });
    await until(() => wrapper.text().includes('単体'));
    expect(wrapper.text()).toContain('単体');
  });
});
