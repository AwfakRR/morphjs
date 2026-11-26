import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { animate } from '../src/index';
import { ensureMotion, wrapMotionControls } from '../src/adapters/motion-adapter';

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('SVGElement', class {});
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  await ensureMotion();
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeTween() {
  const target = { value: 0 };
  const controls = animate(target as any, { value: [0, 100] }, {
    engine: 'motion', duration: 2, autoplay: false, ease: 'linear',
  });
  return { target, controls };
}

it('pauses native playback even when Motion retains its finished state after replay', () => {
  const pause = vi.fn();
  const track = { state: 'finished', animation: { state: 'finished' }, pause };
  const group = { state: 'finished', animations: [track] };
  const controls = wrapMotionControls(group);

  controls.pause();

  expect(pause).toHaveBeenCalledOnce();
});

it('seeks a paused Motion tween in seconds and reports its playhead', async () => {
  const { target, controls } = makeTween();
  try {
    controls.seek?.(0.5);
    await vi.advanceTimersByTimeAsync(64);

    expect(target.value).toBeCloseTo(25);
    expect(controls.currentTime).toBeCloseTo(0.5);
    expect(controls.progress).toBeCloseTo(0.25);
  } finally {
    controls.cancel();
  }
});

it('reverses a paused Motion tween from its current position', async () => {
  const { target, controls } = makeTween();
  try {
    controls.play();
    await vi.advanceTimersByTimeAsync(800);
    controls.pause();
    await vi.advanceTimersByTimeAsync(32);
    const before = target.value;
    expect(before).toBeGreaterThan(20);

    controls.reverse();
    await vi.advanceTimersByTimeAsync(160);

    expect(target.value).toBeGreaterThan(before - 12);
    expect(target.value).toBeLessThan(before - 5);
    expect(controls.currentTime).toBeCloseTo(target.value / 50, 2);
    expect(controls.progress).toBeCloseTo(target.value / 100, 2);
  } finally {
    controls.cancel();
  }
});

it('seeks and reverses a delayed JS tween on its rendered playhead', async () => {
  const target = { value: 0 };
  const controls = animate(target as any, { value: [0, 100] }, {
    engine: 'motion', duration: 2, delay: 0.5, autoplay: false, ease: 'linear',
  });
  try {
    controls.seek?.(1);
    await vi.advanceTimersByTimeAsync(64);
    expect(target.value).toBeCloseTo(50);
    expect(controls.currentTime).toBeCloseTo(1);
    expect(controls.progress).toBeCloseTo(0.5);

    controls.play();
    await vi.advanceTimersByTimeAsync(160);
    const forward = target.value;
    expect(forward).toBeGreaterThan(55);
    controls.reverse();
    await vi.advanceTimersByTimeAsync(160);
    expect(target.value).toBeGreaterThan(forward - 10);
    expect(target.value).toBeLessThan(forward - 6);

    controls.pause();
    await vi.advanceTimersByTimeAsync(64);
    const paused = target.value;
    expect(paused).toBeGreaterThan(40);
    expect(paused).toBeLessThan(55);
    controls.play();
    await vi.advanceTimersByTimeAsync(160);
    expect(target.value).toBeGreaterThan(paused - 10);
    expect(target.value).toBeLessThan(paused - 6);

    controls.pause();
    controls.seek?.(0.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(controls.currentTime).toBeCloseTo(0.5);
    await vi.advanceTimersByTimeAsync(64);
    expect(target.value).toBeCloseTo(25);
    expect(controls.currentTime).toBeCloseTo(0.5);

    controls.seek?.(0.75);
    controls.play();
    await vi.advanceTimersByTimeAsync(160);
    expect(target.value).toBeGreaterThan(28);
    expect(target.value).toBeLessThan(31);
  } finally {
    controls.cancel();
  }
});

it('preserves the unelapsed part of the initial Motion delay when paused', async () => {
  const target = { value: 0 };
  const controls = animate(target as any, { value: [0, 100] }, {
    engine: 'motion', duration: 2, delay: 0.5, ease: 'linear',
  });
  try {
    await vi.advanceTimersByTimeAsync(112);
    controls.pause();
    await vi.advanceTimersByTimeAsync(640);
    expect(target.value).toBe(0);
    expect(controls.currentTime).toBe(0);

    controls.play();
    await vi.advanceTimersByTimeAsync(320);
    expect(target.value).toBe(0);
    await vi.advanceTimersByTimeAsync(128);
    expect(target.value).toBeGreaterThan(1);
    expect(target.value).toBeLessThan(5);
  } finally {
    controls.cancel();
  }
});

it.each([0.25, -0.15])('keeps the first keyframe when canceling after a completed rewind (delay %s)', async delay => {
  const target = { value: 0 };
  const onComplete = vi.fn();
  const controls = animate(target as any, { value: [0, 100] }, {
    engine: 'motion', duration: 1, delay, ease: 'linear', onComplete,
  });
  await vi.advanceTimersByTimeAsync(500 + delay * 1000);
  expect(target.value).toBeGreaterThan(45);

  controls.reverse();
  await vi.advanceTimersByTimeAsync(640);
  expect(target.value).toBe(0);
  expect(controls.playState).toBe('finished');
  expect(onComplete).toHaveBeenCalledOnce();

  controls.cancel();
  await vi.advanceTimersByTimeAsync(64);
  expect(target.value).toBe(0);
  expect(onComplete).toHaveBeenCalledOnce();
});

it('reverses each track from its own position after another track finishes', async () => {
  const target = { short: 0, long: 0 };
  const options = {
    engine: 'motion', duration: 2, ease: 'linear',
    short: { duration: 1, ease: 'linear' },
  };
  const controls = animate(target as any, { short: [0, 100], long: [0, 100] }, options);
  try {
    await vi.advanceTimersByTimeAsync(1200);
    expect(target.short).toBe(100);
    expect(target.long).toBeCloseTo(60, 0);
    const before = target.long;

    controls.reverse();
    await vi.advanceTimersByTimeAsync(160);

    expect(target.short).toBeGreaterThan(80);
    expect(target.short).toBeLessThan(87);
    expect(target.long).toBeGreaterThan(before - 10);
    expect(target.long).toBeLessThan(before - 6);
  } finally {
    controls.cancel();
  }
});

it.each(['play', 'reverse'] as const)('keeps a finished delayed track at its endpoint before %s', async (resume) => {
  await vi.advanceTimersByTimeAsync(3000);
  const target = { short: 0, long: 0 };
  const controls = animate(target as any, { short: [0, 100], long: [0, 100] }, {
    engine: 'motion', duration: 2, delay: 0.5, ease: 'linear',
    short: { duration: 1, delay: 0.5, ease: 'linear' },
  });
  try {
    await vi.advanceTimersByTimeAsync(1728);
    expect(target.short).toBe(100);
    expect(target.long).toBeGreaterThan(50);
    expect(target.long).toBeLessThan(65);

    controls.pause();
    await vi.advanceTimersByTimeAsync(128);
    const paused = target.long;
    expect(target.short).toBe(100);
    expect(controls.currentTime).toBeGreaterThanOrEqual(1);
    expect(controls.currentTime).toBeLessThan(1.016);

    controls[resume]();
    if (resume === 'reverse') expect(controls.currentTime).toBeCloseTo(1, 4);
    await vi.advanceTimersByTimeAsync(160);

    if (resume === 'reverse') {
      expect(target.short).toBeGreaterThan(80);
      expect(target.short).toBeLessThan(87);
      expect(target.long).toBeLessThan(paused - 6);
    } else {
      expect(target.short).toBe(100);
      expect(target.long).toBeGreaterThan(paused + 6);
    }
  } finally {
    controls.cancel();
  }
});
