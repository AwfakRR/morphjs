import { JSDOM } from 'jsdom';
import { act, createElement, StrictMode, useLayoutEffect } from 'react';
import { act as rendererAct, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import type { MorphControls, MorphScope, MorphTargets } from 'morphjs';

it('keeps the same scope across renders and reverts it on unmount', async () => {
  const { useMorphScope } = await import('../src/index');
  const cleanup = vi.fn();
  const scopes: MorphScope[] = [];
  function Probe({ count }: { count: number }) {
    const scope = useMorphScope();
    scopes.push(scope);
    scope.add(cleanup);
    return createElement('span', null, count);
  }

  let renderer!: ReturnType<typeof create>;
  rendererAct(() => { renderer = create(createElement(Probe, { count: 0 })); });
  rendererAct(() => renderer.update(createElement(Probe, { count: 1 })));
  expect(scopes[0]).toBe(scopes[1]);
  rendererAct(() => renderer.unmount());
  expect(cleanup).toHaveBeenCalledOnce();
  expect(scopes[0].size).toBe(0);
});

it('cancels useMorphScope and useAnimate animations on StrictMode replay and unmount', async () => {
  const { window } = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  vi.resetModules();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('navigator', window.navigator);
  vi.stubGlobal('Element', window.Element);
  vi.stubGlobal('HTMLElement', window.HTMLElement);
  vi.stubGlobal('NodeList', window.NodeList);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  try {
    const [{ createRoot }, { useAnimate, useMorphScope }, { ensureMotion }] = await Promise.all([
      import('react-dom/client'),
      import('../src/index'),
      import('../../core/src/adapters/motion-adapter'),
    ]);
    await ensureMotion();
    const root = createRoot(window.document.getElementById('root')!);
    const runs: ReturnType<typeof vi.spyOn<MorphControls, 'cancel'>>[][] = [];

    function Probe() {
      const scope = useMorphScope();
      const [ref, animate] = useAnimate<HTMLDivElement>();
      useLayoutEffect(() => {
        expect(animate('.missing', { opacity: 0 })).toBeNull();
        const scoped = scope.animate({ value: 0 } as unknown as MorphTargets, { value: [0, 100] }, 10);
        const fromRef = animate('.card', { opacity: [1, 0] }, { duration: 10 })!;
        runs.push([vi.spyOn(scoped, 'cancel'), vi.spyOn(fromRef, 'cancel')]);
      }, [scope, animate]);
      return createElement('div', { ref }, createElement('span', { className: 'card' }));
    }

    try {
      await act(async () => root.render(createElement(StrictMode, null, createElement(Probe))));
      expect(runs).toHaveLength(2);
      for (const cancel of runs[0]) expect(cancel).toHaveBeenCalledOnce();
      for (const cancel of runs[1]) expect(cancel).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
    for (const cancel of runs[1]) expect(cancel).toHaveBeenCalledOnce();
  } finally {
    window.close();
    vi.unstubAllGlobals();
  }
});
