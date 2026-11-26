import 'animejs';
import { afterEach, expect, it, vi } from 'vitest';
import { animate, timeline } from '../src/index';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['options', 'easeIn', 0.3121],
  ['parameters', 'easeIn', 0.3121],
  ['options', 'in', 0.3121],
  ['options', (progress: number) => progress ** 2, 0.25],
] as const)('applies Anime tween ease from %s: %s', async (source, ease, expected) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});

  const target = { opacity: 0 };
  const controls = animate(target as any, { opacity: 1, ...(source === 'parameters' ? { ease } : {}) }, {
    engine: 'anime', duration: 1, autoplay: false, ...(source === 'options' ? { ease } : {}),
  });

  try {
    controls.seek?.(0.5);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.5));
    expect(target.opacity).toBeCloseTo(expected, 4);
  } finally {
    controls.cancel();
  }
});

it.each(['defaults', 'segment'] as const)('applies a named Anime timeline ease from %s', async (source) => {
  const target = { opacity: 0 };
  const ease = 'easeInOutQuad';
  const controls = timeline({
    autoplay: false,
    defaults: { duration: 1, ...(source === 'defaults' ? { ease } : {}) },
  }).add(target as any, { opacity: 1, ...(source === 'segment' ? { ease } : {}) });

  try {
    controls.seek?.(0.25);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.25));
    expect(target.opacity).toBeCloseTo(0.125, 4);
  } finally {
    controls.cancel();
  }
});
