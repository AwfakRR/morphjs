import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { animate, spring } from '../src/index';
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
});
