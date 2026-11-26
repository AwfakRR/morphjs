import { afterEach, expect, it, vi } from 'vitest';
import type { MorphTargets } from '../src/types';

const { loadAnime, animateMotion } = vi.hoisted(() => ({
  loadAnime: vi.fn(),
  animateMotion: vi.fn((_targets: unknown, _props: unknown, _options: { delay: (i: number, total: number) => number }) =>
    ({ finished: Promise.resolve() })),
}));

vi.mock('animejs', async importOriginal => {
  loadAnime();
  return importOriginal();
});
vi.mock('motion', () => ({ animate: animateMotion }));

afterEach(() => vi.unstubAllGlobals());

it('uses Anime grid offsets on a first animation without preloading Anime', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('SVGElement', class {});
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('HTMLCollection', class {});
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const { animate, stagger } = await import('../src/index');
  const delay = stagger(0.05, { grid: [3, 3], from: 'center' });
  await vi.dynamicImportSettled();
  expect(loadAnime).not.toHaveBeenCalled();

  const targets = Array.from({ length: 9 }, () => ({}));
  await animate(targets as MorphTargets, { opacity: 1 }, { delay }).finished;

  expect(loadAnime).toHaveBeenCalledOnce();
  expect(animateMotion).toHaveBeenCalledOnce();
  const { delay: motionDelay } = animateMotion.mock.lastCall![2];
  const offsets = targets.map((_, i) => motionDelay(i, targets.length));
  const expected = [0.0705, 0.05, 0.0705, 0.05, 0, 0.05, 0.0705, 0.05, 0.0705];
  offsets.forEach((offset, i) => expect(offset).toBeCloseTo(expected[i]));
});
