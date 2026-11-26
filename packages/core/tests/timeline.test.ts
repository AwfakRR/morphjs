import { expect, it } from 'vitest';
import { ensureAnime } from '../src/adapters/anime-adapter';
import { timeline } from '../src/index';

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

it('uses seconds for Anime segment timing before and after initialization', async () => {
  await ensureAnime();
  const tl = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 0.5, delay: 0.25 });

  expect(tl.duration).toBeCloseTo(0.75, 5);

  tl.add({ x: 0 }, { x: 100, duration: 0.25, delay: 0.125 });
  expect(tl.duration).toBeCloseTo(1.125, 5);
});
