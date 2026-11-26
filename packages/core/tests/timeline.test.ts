import { expect, it, vi } from 'vitest';
import type { MorphTargets } from '../src/types';
import { animeAdapter, ensureAnime } from '../src/adapters/anime-adapter';
import { animeTimelineStagger } from '../src/api/stagger';
import { stagger, timeline } from '../src/index';

it('positions Anime timeline segments in seconds before and after initialization', async () => {
  await ensureAnime();
  const tl = timeline({ autoplay: false, defaults: { duration: 1 } })
    .add({ x: 0 }, { x: 1 }, 0)
    .add({ x: 0 }, { x: 1 }, '-=0.2')
    .add({ x: 0 }, { x: 1 }, '-=0.2');

  expect(tl.duration).toBeCloseTo(2.6, 5);

  tl.add({ x: 0 }, { x: 1 }, 3);
  expect(tl.duration).toBeCloseTo(4, 5);

  tl.add({ x: 0 }, { x: 1 }, '+=0.5');
  expect(tl.duration).toBeCloseTo(5.5, 5);
});

it('uses seconds for Anime timeline defaults', async () => {
  await ensureAnime();
  const tl = timeline({ autoplay: false, defaults: { duration: 0.5, delay: 0.25 } })
    .add({ x: 0 }, { x: 100 });

  expect(tl.duration).toBeCloseTo(0.75, 5);
});

it('uses Anime grid stagger delays for each segment with timeline defaults', async () => {
  await ensureAnime();
  const targets = Array.from({ length: 4 }, () => ({ x: 0 }));
  const tl = timeline({
    autoplay: false,
    defaults: { duration: 0.5, delay: stagger(0.1, { grid: [2, 2] }), ease: 'linear' },
  }).add({ x: 0 }, { x: 100 });
  expect(tl.duration).toBeCloseTo(0.5, 5);

  tl.add(targets as unknown as MorphTargets, { x: 100 });
  expect(tl.duration).toBeCloseTo(1.141, 5);
  tl.seek?.(0.61);
  expect(targets.map(target => target.x)).toEqual([22, 2, 2, 0]);
});

it('passes numeric target counts through to older Anime grid staggers', () => {
  const compute = vi.fn((_target: unknown, index: number, total: number) => index * 100 + total);
  const nativeStagger = vi.spyOn(animeAdapter, 'stagger').mockReturnValue(compute);
  try {
    const delay = animeTimelineStagger(stagger(0.1, { grid: [2, 2] }));
    const target = { x: 0 };
    expect(delay?.(target, 1, 4)).toBe(104);
    expect(delay?.(target, 2, 4)).toBe(204);
    expect(compute).toHaveBeenCalledWith(target, 1, 4);
    expect(nativeStagger).toHaveBeenCalledOnce();
  } finally {
    nativeStagger.mockRestore();
  }
});

it('uses seconds for numeric starts in Anime grid timeline defaults', async () => {
  await ensureAnime();
  const targets = Array.from({ length: 4 }, () => ({ x: 0 }));
  const tl = timeline({
    autoplay: false,
    defaults: { duration: 0.5, delay: stagger(0.1, { grid: [2, 2], start: 0.25 }), ease: 'linear' },
  }).add(targets as unknown as MorphTargets, { x: 100 });
  expect(tl.duration).toBeCloseTo(0.891, 5);
  tl.seek?.(0.11);
  expect(targets.map(target => target.x)).toEqual([0, 0, 0, 0]);
  tl.seek?.(0.3);
  expect(targets.map(target => target.x)).toEqual([10, 0, 0, 0]);
});

it('uses seconds for index-based Anime timeline default delays', async () => {
  await ensureAnime();
  const targets = [{ x: 0 }, { x: 0 }] as unknown as MorphTargets;
  const tl = timeline({ autoplay: false, defaults: { duration: 0.5, delay: (index, total) => index / total } })
    .add(targets, { x: 100 });

  expect(tl.duration).toBeCloseTo(1, 5);
});

it('uses seconds for Anime segment timing before and after initialization', async () => {
  await ensureAnime();
  const tl = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 0.5, delay: 0.25 });

  expect(tl.duration).toBeCloseTo(0.75, 5);

  tl.add({ x: 0 }, { x: 100, duration: 0.25, delay: 0.125 });
  expect(tl.duration).toBeCloseTo(1.125, 5);
});
