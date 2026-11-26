import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureMotion } from '../../core/src/adapters/motion-adapter';
import { springStore } from '../src/springStore';

describe('springStore', () => {
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

  it('starts the next spring from the value published by an immediate update', async () => {
    const store = springStore(10, { stiffness: 500, damping: 40 });
    const values: number[] = [];
    const unsubscribe = store.subscribe(value => values.push(value));

    store.update(value => value + 10);
    expect(values).toEqual([10, 20]);

    store.set(30);
    await vi.advanceTimersByTimeAsync(2000);

    expect(values[2]).toBeGreaterThanOrEqual(20);
    expect(values[2]).toBeLessThan(30);
    expect(values.at(-1)).toBe(30);
    unsubscribe();
  });

  it('updates from the current spring value and prevents later spring frames from overwriting it', async () => {
    const store = springStore(10, { stiffness: 500, damping: 40 });
    const values: number[] = [];
    const unsubscribe = store.subscribe(value => values.push(value));

    store.set(30);
    await vi.advanceTimersByTimeAsync(64);
    const current = values.at(-1)!;
    expect(current).toBeGreaterThan(10);
    expect(current).toBeLessThan(30);

    store.update(value => value + 100);
    expect(values.at(-1)).toBe(current + 100);
    const emissionCount = values.length;
    await vi.advanceTimersByTimeAsync(2000);

    expect(values).toHaveLength(emissionCount);
    expect(values.at(-1)).toBe(current + 100);
    unsubscribe();
  });
});
