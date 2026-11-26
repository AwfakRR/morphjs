import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { animate, animationEvents, animeAdapter, gsapAdapter, stateManager, type MorphTargets } from '../src/index';

beforeAll(async () => {
  vi.useFakeTimers();
  await Promise.all([animeAdapter.ensure!(), gsapAdapter.ensure!()]);
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('NodeList', class {});
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(['anime', 'gsap'])('unregisters a running %s animation on cancel without completing it', async engine => {
  const target = { value: 0 };
  const onComplete = vi.fn();
  animationEvents.on('complete', onComplete);
  const controls = animate(target as unknown as MorphTargets, { value: 100 }, { engine, duration: 1 });
  try {
    await vi.advanceTimersByTimeAsync(100);
    expect(target.value).toBeGreaterThan(0);
    expect(target.value).toBeLessThan(100);
    expect(stateManager.count).toBe(1);

    const onFinished = vi.fn();
    void controls.finished.then(onFinished);
    controls.cancel();
    const countAfterCancel = stateManager.count;
    const canceledValue = target.value;

    await vi.advanceTimersByTimeAsync(1000);
    expect(countAfterCancel).toBe(0);
    expect(target.value).toBe(canceledValue);
    expect(onFinished).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  } finally {
    animationEvents.off('complete', onComplete);
    stateManager.cancelAll();
  }
});
