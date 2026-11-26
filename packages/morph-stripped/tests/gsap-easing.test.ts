import { afterEach, expect, it, vi } from 'vitest';
import { animate, timeline } from '../src/index';

afterEach(() => vi.unstubAllGlobals());

const bounceOutAtHalf = 76.5625;

it.each(['options', 'parameters'] as const)('applies a named GSAP tween ease from %s', async (source) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});

  const target = { x: 0 };
  const ease = 'easeOutBounce';
  const controls = animate(target as any, { x: 100, ...(source === 'parameters' ? { ease } : {}) }, {
    engine: 'gsap', duration: 1, autoplay: false, ...(source === 'options' ? { ease } : {}),
  });

  try {
    controls.seek?.(0.5);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.5));
    expect(target.x).toBeCloseTo(bounceOutAtHalf, 4);
  } finally {
    controls.cancel();
  }
});

it.each(['defaults', 'segment', 'late segment'] as const)('applies a named GSAP timeline ease from %s', async (source) => {
  const target = { x: 0 };
  const ease = 'easeOutBounce';
  const tl = timeline({
    engine: 'gsap', autoplay: false,
    defaults: { duration: 1, ...(source === 'defaults' ? { ease } : {}) },
  });
  const props = { x: 100, ...(source !== 'defaults' ? { ease } : {}) };
  if (source === 'late segment') {
    tl.add({ y: 0 } as any, { y: 1, duration: 0.1 });
    await vi.waitFor(() => expect(tl.duration).toBeGreaterThan(0));
  }
  const controls = tl.add(target as any, props, 0);

  try {
    controls.seek?.(0.5);
    await vi.waitFor(() => expect(target.x).not.toBe(0));
    expect(target.x).toBeCloseTo(bounceOutAtHalf, 4);
  } finally {
    controls.cancel();
  }
});

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

  const target = { x: 0 };
  const controls = animate(target as any, { x: 100 }, { engine: 'gsap', duration: 1, autoplay: false, ease });

  try {
    controls.seek?.(0.25);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.25));
    expect(target.x).toBeCloseTo(curve(0.25) * 100, 4);
  } finally {
    controls.cancel();
  }
});
