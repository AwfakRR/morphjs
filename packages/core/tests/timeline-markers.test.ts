import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { animeAdapter, gsapAdapter, timeline, type MorphTargets } from '../src/index';

beforeAll(async () => {
  vi.useFakeTimers();
  await Promise.all([animeAdapter.ensure!(), gsapAdapter.ensure!()]);
});

afterAll(() => vi.useRealTimers());

describe.each(['anime', 'gsap'])('%s timeline markers', (engine) => {
  it.each(['queued', 'live'])('places tweens at a %s label without extending the timeline', (mode) => {
    const first = { value: 0 };
    const second = { value: 0 };
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1, ease: 'linear' } })
      .add(first as unknown as MorphTargets, { value: 100 });

    try {
      if (mode === 'live') expect(tl.duration).toBeCloseTo(1);

      tl.label('later', 2)
        .label('overlap', 'later-=1.5')
        .add(second as unknown as MorphTargets, { value: 100 }, 'overlap');

      expect(tl.duration).toBeCloseTo(1.5);
      tl.seek!(0.75);
      expect(second.value).toBeCloseTo(25);
    } finally {
      tl.cancel();
    }
  });

  it.each(['queued', 'live'])('stops at a %s pause and resumes on play', (mode) => {
    const target = { value: 0 };
    const onPause = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1, ease: 'linear' } })
      .add(target as unknown as MorphTargets, { value: 100 });

    try {
      if (mode === 'live') expect(tl.duration).toBeCloseTo(1);

      tl.label('checkpoint', 0.2).addPause('checkpoint', onPause);
      expect(tl.duration).toBeCloseTo(1);
      expect(onPause).not.toHaveBeenCalled();

      tl.play();
      vi.advanceTimersByTime(400);

      expect(onPause).toHaveBeenCalledTimes(1);
      expect(tl.playState).toBe('paused');
      expect(tl.currentTime).toBeGreaterThanOrEqual(0.2);
      expect(tl.currentTime).toBeLessThan(0.25);
      const pausedValue = target.value;
      vi.advanceTimersByTime(300);
      expect(target.value).toBe(pausedValue);

      tl.play();
      vi.advanceTimersByTime(1000);
      expect(target.value).toBe(100);
    } finally {
      tl.cancel();
    }

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('pauses without a callback and does not fire markers while seeking', () => {
    const target = { value: 0 };
    const onPause = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1, ease: 'linear' } })
      .add(target as unknown as MorphTargets, { value: 100 })
      .addPause(0.2, onPause)
      .addPause(0.6);

    try {
      tl.seek!(0.4);
      expect(onPause).not.toHaveBeenCalled();

      tl.play();
      vi.advanceTimersByTime(400);

      expect(onPause).not.toHaveBeenCalled();
      expect(tl.playState).toBe('paused');
      expect(tl.currentTime).toBeGreaterThanOrEqual(0.6);
      expect(tl.currentTime).toBeLessThan(0.65);

      tl.seek!(0);
      tl.play();
      vi.advanceTimersByTime(400);
      expect(onPause).toHaveBeenCalledTimes(1);
    } finally {
      tl.cancel();
    }

    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
