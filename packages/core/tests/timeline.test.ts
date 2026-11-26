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
