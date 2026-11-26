import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureMotion, motionAdapter } from '../../core/src/adapters/motion-adapter';
import { effectScope } from 'vue';
import { useMorphSpring } from '../src/useMorphSpring';

describe('useMorphSpring', () => {
  const spring = vi.spyOn(motionAdapter, 'spring');

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

  beforeEach(() => { spring.mockClear(); });

  afterAll(() => {
    spring.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  let scope: ReturnType<typeof effectScope> | undefined;

  afterEach(async () => {
    scope?.stop();
    scope = undefined;
    for (const result of spring.mock.results) {
      if (result.type === 'return') result.value.cancel();
    }
    await vi.advanceTimersByTimeAsync(32);
  });

  it('ignores superseded updates and starts the replacement at the current ref value', async () => {
    const { value, set } = useMorphSpring(0, { stiffness: 500, damping: 45 });
    set(100);
    const cancel = vi.spyOn(spring.mock.results[0].value, 'cancel');
    await vi.advanceTimersByTimeAsync(64);
    expect(value.value).toBeGreaterThan(0);
    expect(value.value).toBeLessThan(100);

    value.value = 50;
    set(-100);
    expect(cancel).toHaveBeenCalledOnce();
    expect(spring.mock.calls[1][0].val).toBe(50);
    await vi.advanceTimersByTimeAsync(2000);
    expect(value.value).toBe(-100);

    const [proxy, , , options] = spring.mock.calls[0];
    proxy.val = 100;
    options?.onUpdate?.(100);
    expect(value.value).toBe(-100);
  });

  it('cancels on scope disposal and ignores already queued updates', async () => {
    scope = effectScope();
    const { value, set } = scope.run(() => useMorphSpring(0))!;
    set(100);
    const cancel = vi.spyOn(spring.mock.results[0].value, 'cancel');
    await vi.advanceTimersByTimeAsync(64);
    const current = value.value;
    scope.stop();
    expect(cancel).toHaveBeenCalledOnce();

    const [proxy, , , options] = spring.mock.calls[0];
    proxy.val = 100;
    options?.onUpdate?.(100);
    set(200);
    expect(spring).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(value.value).toBe(current);
  });
});
