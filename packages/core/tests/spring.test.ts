import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { animate, animationEvents, configure, spring, stagger, stateManager } from '../src/index';
import { ensureAnime } from '../src/adapters/anime-adapter';
import { ensureMotion } from '../src/adapters/motion-adapter';

describe('Motion springs', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', new EventTarget());
    vi.stubGlobal('Element', class {});
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

  it('delivers animated object values to onUpdate for a configured spring', async () => {
    const proxy = { val: 0 };
    const values: number[] = [];
    const controls = animate(proxy as any, { val: 100 }, {
      spring: { stiffness: 100, damping: 10 },
      onUpdate: () => values.push(proxy.val),
    });

    await vi.advanceTimersByTimeAsync(2000);
    await controls.finished;

    expect(Math.max(...values)).toBeGreaterThan(100);
    expect(values.at(-1)).toBe(100);
  });

  it('uses spring physics when spring options are omitted', async () => {
    const proxy = { val: 0 };
    const values: number[] = [];
    const controls = spring(proxy as any, { val: 100 }, undefined, {
      onUpdate: () => values.push(proxy.val),
    });

    await vi.advanceTimersByTimeAsync(2000);
    await controls.finished;

    expect(Math.max(...values)).toBeGreaterThan(100);
    expect(values.at(-1)).toBe(100);
  });

  it('delivers onUpdate from both stages of a keyframe spring', async () => {
    const proxy = { val: 0 };
    const values: number[] = [];
    const controls = spring(proxy as any, { val: [0, 100, 40] }, {}, {
      onUpdate: () => values.push(proxy.val),
    });

    await vi.advanceTimersByTimeAsync(4000);
    await controls.finished;

    expect(Math.max(...values)).toBeGreaterThan(100);
    expect(values.at(-1)).toBe(40);
  });

  it('starts a staged spring at its first keyframe rather than the current value', async () => {
    const proxy = { val: 0 };
    const values: number[] = [];
    const controls = animate(proxy as any, { val: [-100, 30, 0] }, {
      spring: true,
      onUpdate: () => values.push(proxy.val),
    });

    await vi.advanceTimersByTimeAsync(4000);
    await controls.finished;

    expect(Math.abs(values[0] + 100)).toBeLessThan(5);
    expect(values).toContain(30);
    expect(values.at(-1)).toBe(0);
  });

  it.each([
    ['single-stage', 100],
    ['staged', [0, 100, 40]],
  ])('unregisters a canceled %s spring without completing it', async (_, val) => {
    const proxy = { val: 0 };
    const onComplete = vi.fn();
    animationEvents.on('complete', onComplete);

    try {
      const controls = spring(proxy as any, { val });
      await vi.advanceTimersByTimeAsync(64);
      expect(proxy.val).toBeGreaterThan(0);
      expect(stateManager.getRunning()).toContainEqual(expect.objectContaining({ controls, targets: proxy }));

      controls.cancel();

      const stillTracked = stateManager.getRunning().some(entry => entry.controls === controls);
      await vi.advanceTimersByTimeAsync(4000);
      expect(stillTracked).toBe(false);
      expect(onComplete).not.toHaveBeenCalled();
    } finally {
      animationEvents.off('complete', onComplete);
      stateManager.cancelFor(proxy as any);
    }
  });

  it('unregisters a spring canceled while its advanced stagger is loading', async () => {
    await ensureAnime();
    const proxy = { val: 0 };
    const controls = spring(proxy as any, { val: 100 }, undefined, {
      delay: stagger(0.1, { grid: [1, 1] }),
    });

    try {
      expect(stateManager.getRunning()).toContainEqual(expect.objectContaining({ controls, targets: proxy }));
      controls.cancel();

      const stillTracked = stateManager.getRunning().some(entry => entry.controls === controls);
      await vi.advanceTimersByTimeAsync(4000);
      expect(stillTracked).toBe(false);
      expect(proxy.val).toBe(0);
    } finally {
      stateManager.cancelFor(proxy as any);
    }
  });
});

describe('Motion springs with reduced motion', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', new EventTarget());
    vi.stubGlobal('Element', class {});
    vi.stubGlobal('NodeList', class {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16)
    );
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    await ensureMotion();
    configure({ reducedMotion: 'always' });
  });

  afterAll(() => {
    configure({ reducedMotion: 'user' });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  type Callbacks = { onUpdate: () => void; onComplete: () => void };

  it.each([
    ['animate({ spring })', (proxy: any, callbacks: Callbacks) =>
      animate(proxy, { val: 100 }, { spring: { stiffness: 100, damping: 10 }, ...callbacks })],
    ['spring()', (proxy: any, callbacks: Callbacks) => spring(proxy, { val: 100 }, undefined, callbacks)],
    ['keyframe spring()', (proxy: any, callbacks: Callbacks) =>
      spring(proxy, { val: [0, 140, 100] }, {}, callbacks)],
  ])('jumps %s straight to its final value', async (_, run) => {
    const proxy = { val: 0 };
    const updates: number[] = [];
    const events: string[] = [];
    const controls = run(proxy, {
      onUpdate: () => (events.push('update'), updates.push(proxy.val)),
      onComplete: () => events.push('complete'),
    });
    let finishedWith: number | undefined;
    controls.finished.then(() => (finishedWith = proxy.val));
    const samples: number[] = [];

    for (let elapsed = 0; elapsed < 1000; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50);
      samples.push(proxy.val);
    }
    await vi.advanceTimersByTimeAsync(3000);
    await controls.finished;

    expect(samples).toEqual(samples.map(() => 100));
    expect(updates.length).toBeGreaterThan(0);
    expect(updates).toEqual(updates.map(() => 100));
    expect(events.at(-1)).toBe('complete');
    expect(finishedWith).toBe(100);
  });
});
