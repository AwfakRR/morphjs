import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { animate } from '../src/index';
import { loadMotion } from '../src/engine';

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
  await loadMotion();
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
