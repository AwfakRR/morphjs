import { JSDOM } from 'jsdom';
import { act, createElement, StrictMode, useLayoutEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { ensureMotion } from '../../core/src/adapters/motion-adapter';

it('starts a spring requested by a consumer layout effect during StrictMode replay', async () => {
  const { window } = new JSDOM('<div id="root"></div>');
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('navigator', window.navigator);
  vi.stubGlobal('Element', window.Element);
  vi.stubGlobal('NodeList', window.NodeList);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);

  try {
    const [{ createRoot }, { useMorphSpring }] = await Promise.all([
      import('react-dom/client'),
      import('../src/useMorphSpring'),
      ensureMotion(),
    ]);
    const container = window.document.getElementById('root')!;
    const root = createRoot(container);
    const setup = vi.fn();

    function Probe() {
      const [value, setTarget] = useMorphSpring(0, { stiffness: 500, damping: 45 });
      useLayoutEffect(() => {
        setup();
        setTarget(100);
      }, []);
      return createElement('span', null, value);
    }

    try {
      await act(async () => root.render(createElement(StrictMode, null, createElement(Probe))));
      expect(setup).toHaveBeenCalledTimes(2);
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(container.textContent).toBe('100');
    } finally {
      await act(async () => root.unmount());
      await vi.advanceTimersByTimeAsync(32);
    }
  } finally {
    window.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
