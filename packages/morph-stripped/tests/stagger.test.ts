import 'animejs';
import { afterEach, expect, it, vi } from 'vitest';
import { animate, stagger } from '../src/index';
import type { MorphAnimationOptions, MorphTargets } from '../src/types';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['Anime', { engine: 'anime' }, 'first', [0, 100, 200, 300, 400]],
  ['repeat routed to Anime', { repeat: 1 }, 'first', [0, 100, 200, 300, 400]],
  ['GSAP', { engine: 'gsap' }, 'last', [400, 300, 200, 100, 0]],
] as const)('preserves per-item stagger delays on %s', async (
  _, options: MorphAnimationOptions, from, delays,
) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});

  const targets = delays.map(() => ({ x: 0 }));
  const controls = animate(targets as unknown as MorphTargets, { x: 100 }, {
    ...options, autoplay: false, duration: 0.2, ease: 'linear', delay: stagger(0.1, { from }),
  });

  try {
    await vi.waitFor(() => expect(controls.playState).not.toBe('idle'));
    const samples = [50, 150, 250, 350, 450];
    const positions = samples.map(ms => {
      controls.seek?.(ms / 1000);
      return targets.map(({ x }) => x);
    });
    expect(positions).toEqual(samples.map(ms =>
      delays.map(delay => expect.closeTo(Math.min(100, Math.max(0, (ms - delay) / 2)), 5)),
    ));
  } finally {
    controls.cancel();
  }
});
