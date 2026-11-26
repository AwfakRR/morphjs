import { afterEach, expect, it, vi } from 'vitest';
import { animate } from '../src/index';

afterEach(() => vi.unstubAllGlobals());

const polynomial = (degree: number, kind: string) => (p: number) =>
  kind === 'In' ? p ** degree
    : kind === 'Out' ? 1 - (1 - p) ** degree
      : p < 0.5 ? 2 ** (degree - 1) * p ** degree : 1 - (2 - 2 * p) ** degree / 2;

it.each(
  ([['Quad', 2], ['Cubic', 3], ['Quart', 4]] as const).flatMap(([name, degree]) =>
    ['In', 'Out', 'InOut'].map(kind => [`ease${kind}${name}`, polynomial(degree, kind)] as const)),
)('maps %s to the GSAP ease of the same degree', async (ease, curve) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('NodeList', class {});

  const target = { x: 0 };
  const controls = animate(target as any, { x: 100 }, { engine: 'gsap', duration: 1, autoplay: false, ease });

  try {
    controls.seek(0.25);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.25));
    expect(target.x).toBeCloseTo(curve(0.25) * 100, 4);
  } finally {
    controls.cancel();
  }
});
