import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureMotion, motionAdapter } from '../../core/src/adapters/motion-adapter';
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

  let renderer: ReturnType<typeof create> | undefined;

  function renderSpring() {
    let result: ReturnType<typeof useMorphSpring>;
    function Probe() {
      result = useMorphSpring(0, { stiffness: 500, damping: 45 });
      return null;
    }
    act(() => { renderer = create(createElement(Probe)); });
    return () => result;
  }

  afterEach(async () => {
    if (renderer) act(() => renderer.unmount());
    renderer = undefined;
    for (const result of spring.mock.results) {
      if (result.type === 'return') result.value.cancel();
    }
    await vi.advanceTimersByTimeAsync(32);
  });

  it('cancels a superseded spring, ignores its queued updates and settles at the latest target', async () => {
    const read = renderSpring();
    expect(read()[0]).toBe(0);
    act(() => read()[1](0));
    expect(spring).not.toHaveBeenCalled();

    act(() => read()[1](100));
    const first = spring.mock.results[0].value;
    const cancel = vi.spyOn(first, 'cancel');
    await act(() => vi.advanceTimersByTimeAsync(64));
    const current = read()[0];
    expect(current).toBeGreaterThan(0);
    expect(current).toBeLessThan(100);

    act(() => read()[1](-100));
    expect(cancel).toHaveBeenCalledOnce();
    expect(spring.mock.calls[1][0].val).toBe(current);

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(read()[0]).toBe(-100);
    act(() => {
      spring.mock.calls[0][0].val = 100;
      spring.mock.calls[0][3]?.onUpdate?.(100);
    });
    expect(read()[0]).toBe(-100);
  });

  it('does not write a committed render value back over a newer proxy value', () => {
    const read = renderSpring();
    act(() => read()[1](100));
    const [proxy, , , options] = spring.mock.calls[0];
    act(() => {
      proxy.val = 10;
      options?.onUpdate?.(10);
      proxy.val = 20;
    });
    expect(read()[0]).toBe(10);
    act(() => read()[1](200));
    expect(spring.mock.calls[1][0].val).toBe(20);
  });

  it('cancels on unmount and ignores even an already queued update', async () => {
    const read = renderSpring();
    act(() => read()[1](100));
    const cancel = vi.spyOn(spring.mock.results[0].value, 'cancel');
    await act(() => vi.advanceTimersByTimeAsync(64));
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(cancel).toHaveBeenCalledOnce();

    const [proxy, , , options] = spring.mock.calls[0];
    const readProxy = vi.fn(() => 100);
    Object.defineProperty(proxy, 'val', { get: readProxy, set: () => {} });
    act(() => options?.onUpdate?.(100));
    expect(readProxy).not.toHaveBeenCalled();
  });
});
