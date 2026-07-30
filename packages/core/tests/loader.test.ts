import { describe, expect, it } from 'vitest';

import { buildModel } from '../src/build.js';
import type { ModuleResolver } from '../src/loader.js';
import { loadDocument } from '../src/loader.js';

/** Serve a fixed set of files, so the loader can be tested without a filesystem. */
function memoryResolver(files: Record<string, string>): ModuleResolver {
  return (specifier) => {
    const source = files[specifier];
    return source === undefined ? undefined : { path: specifier, source };
  };
}

const LIBRARY = `
model dm3 "Yamaha DM3" as mixer {
  in  CH[1..16] : xlr
  out L, R      : xlr
  @vendor "Yamaha"
}
signal madi64 : audio { color: "#f59e0b" }
compat aes -> xlr : ok "社内標準"
`;

async function build(source: string, files: Record<string, string> = {}) {
  const loaded = await loadDocument(source, { resolver: memoryResolver(files), path: 'main.khm' });
  const built = buildModel(loaded.document);
  return {
    diagram: built.diagram,
    diagnostics: [...loaded.diagnostics, ...built.diagnostics],
    loaded: loaded.loaded,
  };
}

describe('use', () => {
  it('brings a model into scope so a device can be built from it', async () => {
    const { diagram, diagnostics } = await build('use "lib.khm"\ndevice mx from dm3', {
      'lib.khm': LIBRARY,
    });
    expect(diagnostics).toEqual([]);
    const device = diagram.devices[0]!;
    expect(device.label).toBe('Yamaha DM3');
    expect(device.kind).toBe('mixer');
    expect(device.ports).toHaveLength(18);
    expect(device.meta['vendor']).toBe('Yamaha');
  });

  it('imports signal and compat declarations too', async () => {
    const { diagram } = await build('use "lib.khm"\na.X -> b.Y : madi64', {
      'lib.khm': LIBRARY,
    });
    expect(diagram.links[0]?.signal.color).toBe('#f59e0b');
    expect(diagram.compatRules).toHaveLength(1);
  });

  it('reads each file once however many times it is reached', async () => {
    const { loaded } = await build('use "a.khm"\nuse "b.khm"', {
      'a.khm': 'use "lib.khm"',
      'b.khm': 'use "lib.khm"',
      'lib.khm': LIBRARY,
    });
    // Depth first: main pulls a, a pulls lib, then b — which already has lib.
    expect(loaded).toEqual(['main.khm', 'a.khm', 'lib.khm', 'b.khm']);
    expect(loaded.filter((p) => p === 'lib.khm')).toHaveLength(1);
  });

  it('terminates on a cycle instead of hanging', async () => {
    const { loaded, diagnostics } = await build('use "a.khm"', {
      'a.khm': 'use "b.khm"',
      'b.khm': 'use "a.khm"',
    });
    expect(loaded).toEqual(['main.khm', 'a.khm', 'b.khm']);
    expect(diagnostics.filter((d) => d.code === 'unresolved-import')).toEqual([]);
  });

  it('reports a path it cannot find', async () => {
    const { diagnostics } = await build('use "missing.khm"');
    expect(diagnostics[0]?.code).toBe('unresolved-import');
  });

  it('reports a use when no resolver was supplied', async () => {
    const loaded = await loadDocument('use "lib.khm"');
    expect(loaded.diagnostics[0]?.code).toBe('unresolved-import');
  });

  it('leaves devices and connections behind, and says it did', async () => {
    const { diagram, diagnostics } = await build('use "lib.khm"', {
      'lib.khm': 'device stray as camera\na.X -> b.Y',
    });
    expect(diagram.devices).toHaveLength(0);
    const hit = diagnostics.find((d) => d.code === 'ignored-in-import');
    expect(hit?.message).toContain('model / signal / compat');
  });

  it('surfaces a syntax error inside a library', async () => {
    const { diagnostics } = await build('use "lib.khm"', { 'lib.khm': '!!! broken' });
    const hit = diagnostics.find((d) => d.code === 'parse-error');
    expect(hit?.message).toContain('lib.khm');
  });
});

describe('model instantiation', () => {
  it('lets a device override the label without losing the ports', async () => {
    const { diagram } = await build('use "lib.khm"\ndevice mx from dm3 "予備卓"', {
      'lib.khm': LIBRARY,
    });
    expect(diagram.devices[0]?.label).toBe('予備卓');
    expect(diagram.devices[0]?.ports).toHaveLength(18);
  });

  it('adds device ports to the model ports rather than replacing them', async () => {
    const { diagram } = await build('use "lib.khm"\ndevice mx from dm3 { in DANTE : dante }', {
      'lib.khm': LIBRARY,
    });
    const names = diagram.devices[0]!.ports.map((p) => p.name);
    expect(names).toContain('CH1');
    expect(names).toContain('DANTE');
    expect(names).toHaveLength(19);
  });

  it('builds two independent devices from one model', async () => {
    const { diagram } = await build('use "lib.khm"\ndevice a from dm3\ndevice b from dm3 "2台目"', {
      'lib.khm': LIBRARY,
    });
    expect(diagram.devices).toHaveLength(2);
    expect(diagram.devices[0]?.label).toBe('Yamaha DM3');
    expect(diagram.devices[1]?.label).toBe('2台目');
  });

  it('reports a model that was never declared', async () => {
    const { diagnostics } = await build('device mx from nosuchmodel');
    expect(diagnostics[0]?.code).toBe('unknown-model');
  });

  it('lets a local model override an imported one of the same name', async () => {
    const { diagram } = await build(
      'use "lib.khm"\nmodel dm3 "改造卓" as mixer { in CH[1..2] : xlr }\ndevice mx from dm3',
      { 'lib.khm': LIBRARY },
    );
    expect(diagram.devices[0]?.label).toBe('改造卓');
    expect(diagram.devices[0]?.ports).toHaveLength(2);
  });

  it('keeps models out of the diagram until a device names one', async () => {
    const { diagram } = await build('use "lib.khm"', { 'lib.khm': LIBRARY });
    expect(diagram.devices).toHaveLength(0);
  });
});
