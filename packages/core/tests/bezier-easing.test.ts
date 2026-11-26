import 'animejs';
import { afterEach, expect, it, vi } from 'vitest';
import { animate, timeline } from '../src/index';

afterEach(() => vi.unstubAllGlobals());

it.each(['anime', 'gsap'])('applies a per-call Bezier tuple to a real %s tween', async (engine) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('NodeList', class {});

  const target = { x: 0 };
  const controls = animate(target as any, { x: 100 }, {
    engine, duration: 1, autoplay: false, ease: [0.2, 0.8, 0.6, 1.4],
  });

  try {
    controls.seek(0.25);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.25));
    expect([0.25, 0.5, 0.75].map(time => {
      controls.seek(time);
      return target.x;
    })).toEqual([68.62956, 102.49903, 112.71030].map(x => expect.closeTo(x, 2)));
    controls.seek(1);
    expect(target.x).toBe(100);
  } finally {
    controls.cancel();
  }
});

it.each([
  ['anime', 'defaults'], ['gsap', 'defaults'],
  ['anime', 'segment'], ['gsap', 'segment'],
] as const)('applies a Bezier tuple in a real %s timeline (%s)', async (engine, source) => {
  const target = { x: 0 };
  const ease: [number, number, number, number] = [0.2, 0.8, 0.6, 1.4];
  const controls = timeline({
    adapter: engine, autoplay: false,
    defaults: { duration: 1, ...(source === 'defaults' ? { ease } : {}) },
  }).add(target as any, { x: 100, ...(source === 'segment' ? { ease } : {}) });

  try {
    controls.seek?.(0.5);
    await vi.waitFor(() => expect(target.x).not.toBe(0));
    expect(target.x).toBeCloseTo(102.49903, 2);
  } finally {
    controls.cancel();
  }
});
