import { expect, it, vi } from 'vitest';
import { timeline } from '../src/index';

vi.mock('animejs', () => { throw new Error('Anime.js is not installed'); });

it('keeps percentage placement when the default child falls back to GSAP', async () => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false })
    .add(target, { x: 100, duration: 2, ease: 'none' });
  const parent = timeline({ engine: 'gsap', autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 1 })
    .add(child, '+=50%');

  try {
    parent.seek(2.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(2.5));
    expect(parent.duration).toBeCloseTo(4);
    expect(target.x).toBeCloseTo(25);
    parent.finish();
    await parent.finished;
    expect(parent.currentTime).toBeCloseTo(4);
  } finally {
    parent.cancel();
  }
});
