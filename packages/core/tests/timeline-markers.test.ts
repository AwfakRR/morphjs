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

  it.each(['queued', 'live'])('stops at a %s pause and resumes on play', async (mode) => {
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
      await vi.advanceTimersByTimeAsync(400);

      expect(onPause).toHaveBeenCalledTimes(1);
      expect(tl.playState).toBe('paused');
      expect(tl.currentTime).toBeCloseTo(0.2, 5);
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

  it('pauses without a callback and does not fire markers while seeking', async () => {
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
      await vi.advanceTimersByTimeAsync(400);

      expect(onPause).not.toHaveBeenCalled();
      expect(tl.playState).toBe('paused');
      expect(tl.currentTime).toBeCloseTo(0.6, 5);

      tl.seek!(0);
      tl.play();
      await vi.advanceTimersByTimeAsync(400);
      expect(onPause).toHaveBeenCalledTimes(1);
    } finally {
      tl.cancel();
    }

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it.each(['running', 'paused'])('preserves a %s playhead when adding a pause', async (state) => {
    const onPause = vi.fn();
    const tl = timeline({ engine, autoplay: state === 'paused', defaults: { duration: 1 } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 });

    try {
      tl.play();
      await Promise.resolve();
      vi.advanceTimersByTime(300);
      if (state === 'paused') tl.pause();
      const before = tl.currentTime;

      tl.addPause(0.7, onPause);
      expect(tl.currentTime).toBe(before);
      expect(tl.playState).toBe(state);
      if (state === 'paused') tl.play();

      await vi.advanceTimersByTimeAsync(500);
      expect(onPause).toHaveBeenCalledOnce();
      expect(tl.currentTime).toBeCloseTo(0.7, 5);
    } finally {
      tl.cancel();
    }
  });

  it('renders later tweens before invoking a pause callback that seeks', async () => {
    const later = { value: 0 };
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1, ease: 'linear' } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 })
      .addPause(0.2, () => tl.seek!(0.6))
      .add(later as unknown as MorphTargets, { value: 100 }, 0);

    try {
      tl.play();
      await vi.advanceTimersByTimeAsync(400);
      expect(tl.currentTime).toBeCloseTo(0.6);
      expect(later.value).toBeCloseTo(60);
    } finally {
      tl.cancel();
    }
  });

  it('stops separately at two markers crossed by one frame', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 0.205 } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 })
      .addPause(0.202, second)
      .addPause(0.201, first);

    try {
      tl.play();
      await vi.advanceTimersByTimeAsync(400);
      expect(first).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();
      expect(tl.playState).toBe('paused');
      expect(tl.currentTime).toBeCloseTo(0.201, 5);

      tl.play();
      await vi.advanceTimersByTimeAsync(400);
      expect(second).toHaveBeenCalledOnce();
      expect(tl.playState).toBe('paused');
      expect(tl.currentTime).toBeCloseTo(0.202, 5);
    } finally {
      tl.cancel();
    }
  });

  it('does not skip tween completion when stopping at a marker', async () => {
    const completed = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 0.201 } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100, onComplete: completed })
      .addPause()
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 });

    try {
      tl.play();
      await vi.advanceTimersByTimeAsync(400);
      expect(tl.playState).toBe('paused');
      expect(completed).toHaveBeenCalledOnce();
    } finally {
      tl.cancel();
    }
  });

  it('pauses at the marker during reverse playback', async () => {
    const target = { value: 0 };
    const onPause = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1, ease: 'linear' } })
      .add(target as unknown as MorphTargets, { value: 100 })
      .addPause(0.4, onPause);

    try {
      tl.seek!(0.8);
      tl.reverse();
      await vi.advanceTimersByTimeAsync(500);
      expect(onPause).toHaveBeenCalledOnce();
      expect(tl.playState).toBe('paused');
      expect(target.value).toBeCloseTo(40);
    } finally {
      tl.cancel();
    }
  });

  it('fires every callback at a shared checkpoint', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1 } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 })
      .addPause(0.2, first)
      .addPause(0.2, second);

    try {
      tl.play();
      await vi.advanceTimersByTimeAsync(400);
      expect(tl.currentTime).toBeCloseTo(0.2);
      expect(tl.playState).toBe('paused');
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
    } finally {
      tl.cancel();
    }
  });

  it('fires a final pause with a fractional position', async () => {
    const onPause = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 0.1 } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 })
      .addPause(0.1 + 0.2, onPause);

    try {
      tl.play();
      await vi.advanceTimersByTimeAsync(500);
      expect(onPause).toHaveBeenCalledOnce();
    } finally {
      tl.cancel();
    }
  });

  it('does not stop at the same fractional pause again on resume', async () => {
    const onPause = vi.fn();
    const tl = timeline({ engine, autoplay: false, defaults: { duration: 1 } })
      .add({ value: 0 } as unknown as MorphTargets, { value: 100 })
      .addPause(0.1 + 0.2, onPause);

    try {
      tl.play();
      await vi.advanceTimersByTimeAsync(500);
      expect(onPause).toHaveBeenCalledOnce();
      expect(tl.playState).toBe('paused');

      tl.play();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onPause).toHaveBeenCalledOnce();
      expect(tl.playState).toBe('finished');
    } finally {
      tl.cancel();
    }
  });
});

it('stops at an Anime pause at zero without stopping there again on resume', async () => {
  const onPause = vi.fn();
  const tl = timeline({ engine: 'anime', autoplay: false, defaults: { duration: 1 } })
    .add({ value: 0 } as unknown as MorphTargets, { value: 100 })
    .addPause(0, onPause);

  try {
    tl.play();
    await vi.advanceTimersByTimeAsync(400);
    expect(onPause).toHaveBeenCalledOnce();
    expect(tl.currentTime).toBe(0);
    expect(tl.playState).toBe('paused');

    tl.play();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tl.playState).toBe('finished');
    expect(onPause).toHaveBeenCalledOnce();
  } finally {
    tl.cancel();
  }
});
