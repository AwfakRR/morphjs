import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adapterRegistry,
  animationEvents,
  animeAdapter,
  configure,
  flip,
  gsapAdapter,
  motionAdapter,
  stagger,
  stateManager,
} from '../src/index';
import { resolveAdapter } from '../src/router';
import { createNoopControls, notifyControlsCanceled } from '../src/utils/controls';
import type { IAnimationAdapter, MorphControls } from '../src/types';

interface FakeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

class FakeElement {
  isConnected = true;
  style: Record<string, string> = { transform: '' };
  private attrs = new Map<string, string>();
  private rect: FakeRect;
  computedTransformOrigin = '';
  computedOpacity = '1';

  constructor(rect: FakeRect, flipId?: string) {
    this.rect = { ...rect };
    if (flipId) this.attrs.set('data-flip-id', flipId);
  }

  setRect(rect: Partial<FakeRect>) {
    this.rect = { ...this.rect, ...rect };
  }

  getBoundingClientRect() {
    const { left, top, width, height } = this.rect;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
}

function createManualControls(): {
  controls: MorphControls;
  complete: () => void;
  cancelSpy: ReturnType<typeof vi.fn>;
} {
  let resolveFinished!: () => void;
  const finished = new Promise<void>(resolve => { resolveFinished = resolve; });
  let state: MorphControls['playState'] = 'running';
  const cancelSpy = vi.fn();

  const controls: MorphControls = {
    play: () => { state = 'running'; },
    pause: () => { state = 'paused'; },
    reverse: () => {},
    cancel: () => {
      state = 'cancelled';
      cancelSpy();
      notifyControlsCanceled(controls);
    },
    finish: () => {
      state = 'finished';
      resolveFinished();
    },
    restart: () => { state = 'running'; },
    seek: () => {},
    duration: 0.4,
    progress: 0,
    currentTime: 0,
    get playState() { return state; },
    get finished() { return finished; },
    then: (onFulfilled, onRejected) => finished.then(onFulfilled, onRejected),
    commitStyles: () => {},
  };

  return {
    controls,
    complete: () => {
      state = 'finished';
      resolveFinished();
    },
    cancelSpy,
  };
}

describe('Core layout FLIP transitions', () => {
  let elementsBySelector: Map<string, FakeElement[]>;

  beforeEach(() => {
    elementsBySelector = new Map();
    configure({
      defaultAdapter: undefined,
      defaultDuration: 0.3,
      defaultEase: 'easeOut',
      reducedMotion: 'never',
    });

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => elementsBySelector.get(selector) ?? [],
      querySelector: (selector: string) => {
        const match = selector.match(/^\[data-flip-id="(.+)"\]$/);
        if (match) {
          const id = match[1].replace(/\\(["\\])/g, '$1');
          for (const list of elementsBySelector.values()) {
            const found = list.find(el => el.isConnected && el.getAttribute('data-flip-id') === id);
            if (found) return found;
          }
        }
        return (elementsBySelector.get(selector) ?? [])[0] ?? null;
      },
    });
    vi.stubGlobal('getComputedStyle', (el: FakeElement) => ({
      transformOrigin: el.computedTransformOrigin || `${el.getBoundingClientRect().width / 2}px ${el.getBoundingClientRect().height / 2}px`,
      opacity: el.computedOpacity,
    }));
  });

  afterEach(() => {
    stateManager.cancelAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    configure({
      defaultAdapter: undefined,
      defaultDuration: 0.3,
      defaultEase: 'easeOut',
      reducedMotion: 'user',
    });
  });

  it('routes layout capability to motionAdapter even when defaultAdapter is anime', () => {
    configure({ defaultAdapter: 'anime' });
    expect(resolveAdapter({ layout: true })).toBe(motionAdapter);
  });

  it('delegates to a custom layout adapter when registered with layout capability', () => {
    const layoutSpy = vi.fn(() => createNoopControls());
    const custom: IAnimationAdapter = {
      name: 'custom-layout-test',
      capabilities: ['layout'],
      animate: () => createNoopControls(),
      layout: layoutSpy,
    };
    adapterRegistry.register({ name: custom.name, adapter: custom, priority: 1, capabilities: ['layout'] });
    configure({ defaultAdapter: custom.name });

    const el = new FakeElement({ left: 10, top: 20, width: 100, height: 50 });
    flip(el as any, () => el.setRect({ left: 110, top: 70 }), { duration: 0.5 });

    expect(layoutSpy).toHaveBeenCalledOnce();
    const [entries, opts] = layoutSpy.mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0].dx).toBe(-100);
    expect(entries[0].dy).toBe(-50);
    expect(entries[0].properties).toEqual({ x: [-100, 0], y: [-50, 0] });
    expect(opts.duration).toBe(0.5);
  });

  it('captures, mutates, inverts translation, and accepts numeric duration shorthand', async () => {
    const manual = createManualControls();
    const animateSpy = vi.spyOn(motionAdapter, 'animate').mockReturnValue(manual.controls);
    const el = new FakeElement({ left: 20, top: 40, width: 100, height: 100 });

    const controls = flip(el as any, () => {
      el.setRect({ left: 170, top: 90 });
    }, 0.6);

    expect(animateSpy).toHaveBeenCalledOnce();
    const [targets, props, opts] = animateSpy.mock.calls[0];
    expect(targets).toEqual([el]);
    expect(props).toEqual({ x: [-150, 0], y: [-50, 0] });
    expect(opts?.duration).toBe(0.6);
    expect(opts?.ease).toBe('easeOut');

    manual.complete();
    await expect(controls.finished).resolves.toBeUndefined();
  });

  it('compensates translation for scale around center and custom transform-origin', () => {
    const manual1 = createManualControls();
    const manual2 = createManualControls();
    const animateSpy = vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(manual1.controls)
      .mockReturnValueOnce(manual2.controls);

    // Center origin (100px 50px on 200x100 final box):
    // First center = (50, 25), Last center = (100, 50) -> dx = -50, dy = -25, scale = 0.5
    const centerEl = new FakeElement({ left: 0, top: 0, width: 100, height: 50 });
    flip(centerEl as any, () => centerEl.setRect({ left: 0, top: 0, width: 200, height: 100 }));
    expect(animateSpy.mock.calls[0][1]).toEqual({
      x: [-50, 0],
      y: [-25, 0],
      scaleX: [0.5, 1],
      scaleY: [0.5, 1],
    });

    // Top-left origin (0px 0px):
    // First top-left = (0, 0), Last top-left = (0, 0) -> dx = 0, dy = 0, scale = 0.5
    const topLeftEl = new FakeElement({ left: 0, top: 0, width: 100, height: 50 });
    topLeftEl.computedTransformOrigin = '0px 0px';
    flip(topLeftEl as any, () => topLeftEl.setRect({ left: 0, top: 0, width: 200, height: 100 }));
    expect(animateSpy.mock.calls[1][1]).toEqual({
      scaleX: [0.5, 1],
      scaleY: [0.5, 1],
    });
  });

  it('omits scale when scale: false and animates opacity when fade: true', () => {
    const manual = createManualControls();
    const animateSpy = vi.spyOn(motionAdapter, 'animate').mockReturnValue(manual.controls);
    const el = new FakeElement({ left: 10, top: 20, width: 100, height: 50 });
    el.computedOpacity = '0.25';

    const state = flip.capture(el as any);
    el.setRect({ left: 60, top: 20, width: 200, height: 100 });
    el.computedOpacity = '1';

    flip.from(state, { scale: false, fade: true });

    expect(animateSpy).toHaveBeenCalledOnce();
    expect(animateSpy.mock.calls[0][1]).toEqual({
      x: [-50, 0],
      opacity: [0.25, 1],
    });
  });

  it('skips unchanged or collapsed elements and fires onComplete when nothing moved', async () => {
    const animateSpy = vi.spyOn(motionAdapter, 'animate');
    const onComplete = vi.fn();
    const staticEl = new FakeElement({ left: 10, top: 10, width: 100, height: 50 });
    const hiddenEl = new FakeElement({ left: 10, top: 10, width: 100, height: 50 });

    const state = flip.capture([staticEl, hiddenEl] as any);
    hiddenEl.setRect({ width: 0, height: 0 });

    const controls = flip.from(state, { onComplete });
    expect(animateSpy).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
    await expect(controls.finished).resolves.toBeUndefined();
  });

  it('matches replaced DOM nodes via data-flip-id automatically and via options.targets', () => {
    const manual1 = createManualControls();
    const manual2 = createManualControls();
    const animateSpy = vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(manual1.controls)
      .mockReturnValueOnce(manual2.controls);

    const original = new FakeElement({ left: 0, top: 0, width: 80, height: 80 }, 'hero-card');
    const state = flip.capture(original as any);

    // Replace node in DOM
    original.isConnected = false;
    const replacement = new FakeElement({ left: 200, top: 100, width: 160, height: 160 }, 'hero-card');
    elementsBySelector.set('.card', [replacement]);

    flip.from(state);
    expect(animateSpy.mock.calls[0][0]).toEqual([replacement]);
    expect(animateSpy.mock.calls[0][1]).toEqual({
      x: [-240, 0],
      y: [-140, 0],
      scaleX: [0.5, 1],
      scaleY: [0.5, 1],
    });

    // Explicit options.targets matching
    const replacement2 = new FakeElement({ left: 40, top: 0, width: 80, height: 80 }, 'hero-card');
    flip.from(state, { targets: replacement2 as any });
    expect(animateSpy.mock.calls[1][0]).toEqual([replacement2]);
    expect(animateSpy.mock.calls[1][1]).toEqual({ x: [-40, 0] });
  });

  it('cancels an in-flight FLIP and restores inline transform before measuring the next layout', () => {
    const first = createManualControls();
    const second = createManualControls();
    const animateSpy = vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(first.controls)
      .mockReturnValueOnce(second.controls);

    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    flip(el as any, () => el.setRect({ left: 100, top: 0 }));

    // Simulate engine leaving an inline transform mid-flight
    el.style.transform = 'translateX(-50px)';
    let transformDuringLastRead: string | undefined;
    const origGetRect = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => {
      transformDuringLastRead = el.style.transform;
      return origGetRect();
    };

    // Capture mid-flight visual position (x=50), then mutate layout to x=200
    const midState = flip.capture(el as any);
    el.setRect({ left: 200, top: 0 });
    flip.from(midState);

    expect(first.cancelSpy).toHaveBeenCalledOnce();
    expect(transformDuringLastRead).toBe('');
    expect(animateSpy).toHaveBeenCalledTimes(2);
  });

  it('restores pre-FLIP inline transform on completion when prune is true and preserves when prune is false', async () => {
    const manual1 = createManualControls();
    const manual2 = createManualControls();
    vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(manual1.controls)
      .mockReturnValueOnce(manual2.controls);

    const el1 = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    el1.style.transform = 'rotate(5deg)';
    const c1 = flip(el1 as any, () => el1.setRect({ left: 50, top: 0 }));
    el1.style.transform = 'translateX(0px)';
    manual1.complete();
    await c1.finished;
    expect(el1.style.transform).toBe('rotate(5deg)');

    const el2 = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const c2 = flip(el2 as any, () => el2.setRect({ left: 50, top: 0 }), { prune: false });
    el2.style.transform = 'translateX(0px)';
    manual2.complete();
    await c2.finished;
    expect(el2.style.transform).toBe('translateX(0px)');
  });

  it('respects reducedMotion by skipping engine animation and firing callbacks immediately', async () => {
    configure({ reducedMotion: 'always' });
    const animateSpy = vi.spyOn(motionAdapter, 'animate');
    const onStart = vi.fn();
    const onComplete = vi.fn();

    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const controls = flip(el as any, () => el.setRect({ left: 120, top: 0 }), { onStart, onComplete });

    expect(animateSpy).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    await expect(controls.finished).resolves.toBeUndefined();
  });

  it('applies stagger delays across moving elements and tracks stateManager / animationEvents', async () => {
    const m1 = createManualControls();
    const m2 = createManualControls();
    const animateSpy = vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(m1.controls)
      .mockReturnValueOnce(m2.controls);

    const starts: number[] = [];
    const completes: number[] = [];
    const onStartEvent = () => starts.push(1);
    const onCompleteEvent = () => completes.push(1);
    animationEvents.on('start', onStartEvent);
    animationEvents.on('complete', onCompleteEvent);

    try {
      const a = new FakeElement({ left: 0, top: 0, width: 50, height: 50 });
      const b = new FakeElement({ left: 60, top: 0, width: 50, height: 50 });

      const controls = flip([a, b] as any, () => {
        a.setRect({ left: 60, top: 0 });
        b.setRect({ left: 0, top: 0 });
      }, { delay: stagger(0.1) });

      expect(animateSpy).toHaveBeenCalledTimes(2);
      expect(animateSpy.mock.calls[0][2]?.delay).toBe(0);
      expect(animateSpy.mock.calls[1][2]?.delay).toBe(0.1);
      expect(stateManager.count).toBe(1);
      expect(starts).toHaveLength(1);

      m1.complete();
      m2.complete();
      await controls.finished;
      await Promise.resolve();

      expect(stateManager.count).toBe(0);
      expect(completes).toHaveLength(1);
    } finally {
      animationEvents.off('start', onStartEvent);
      animationEvents.off('complete', onCompleteEvent);
    }
  });

  it('routes spring: true to motionAdapter.spring', () => {
    const manual = createManualControls();
    const springSpy = vi.spyOn(motionAdapter, 'spring').mockReturnValue(manual.controls);
    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });

    flip(el as any, () => el.setRect({ left: 80, top: 40 }), { spring: { stiffness: 300, damping: 25 } });

    expect(springSpy).toHaveBeenCalledOnce();
    expect(springSpy.mock.calls[0][1]).toEqual({ x: [-80, 0], y: [-40, 0] });
    expect(springSpy.mock.calls[0][2]).toEqual({ stiffness: 300, damping: 25 });
  });

  it('runs real GSAP engine with [from, to] tuple conversion via gsap.fromTo', async () => {
    await gsapAdapter.ensure!();
    const target = Object.assign(new FakeElement({ left: 0, top: 0, width: 100, height: 50 }), {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    });

    const controls = flip(target as any, () => {
      target.setRect({ left: 100, top: 50, width: 200, height: 100 });
    }, { engine: 'gsap', duration: 1, autoplay: false, ease: 'linear' });

    controls.seek?.(0);
    expect(target.x).toBeCloseTo(-150, 3);
    expect(target.y).toBeCloseTo(-75, 3);
    expect(target.scaleX).toBeCloseTo(0.5, 3);
    expect(target.scaleY).toBeCloseTo(0.5, 3);

    controls.seek?.(0.5);
    expect(target.x).toBeCloseTo(-75, 3);
    expect(target.y).toBeCloseTo(-37.5, 3);
    expect(target.scaleX).toBeCloseTo(0.75, 3);
    expect(target.scaleY).toBeCloseTo(0.75, 3);

    controls.seek?.(1);
    expect(target.x).toBeCloseTo(0, 3);
    expect(target.y).toBeCloseTo(0, 3);
    expect(target.scaleX).toBeCloseTo(1, 3);
    expect(target.scaleY).toBeCloseTo(1, 3);
    controls.cancel();
  });

  it('runs real Anime.js v4 engine for FLIP transitions', async () => {
    vi.unstubAllGlobals();
    await animeAdapter.ensure!();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('document', { querySelectorAll: () => [], querySelector: () => null });
    vi.stubGlobal('getComputedStyle', (el: FakeElement) => ({
      transformOrigin: `${el.getBoundingClientRect().width / 2}px ${el.getBoundingClientRect().height / 2}px`,
      opacity: '1',
    }));

    const target = Object.assign(new FakeElement({ left: 0, top: 0, width: 100, height: 100 }), {
      x: 0,
      y: 0,
    });

    const controls = flip(target as any, () => {
      target.setRect({ left: 100, top: 40 });
    }, { engine: 'anime', duration: 1, autoplay: false, ease: 'linear' });

    controls.seek?.(0);
    expect(target.x).toBeCloseTo(-100, 3);
    expect(target.y).toBeCloseTo(-40, 3);

    controls.seek?.(0.5);
    expect(target.x).toBeCloseTo(-50, 3);
    expect(target.y).toBeCloseTo(-20, 3);

    controls.seek?.(1);
    expect(target.x).toBeCloseTo(0, 3);
    expect(target.y).toBeCloseTo(0, 3);
    controls.cancel();
  });

  it('holds pending inline invert during deferred engine load and cleans up if canceled before load', async () => {
    let resolveEnsure!: () => void;
    const ensureSpy = vi.fn(() => new Promise<void>(resolve => { resolveEnsure = resolve; }));
    let loaded = false;
    const manual = createManualControls();
    const animateSpy = vi.fn(() => {
      if (!loaded) throw new Error('not loaded');
      return manual.controls;
    });
    const lazyAdapter: IAnimationAdapter = {
      name: 'lazy-layout-test',
      capabilities: ['layout'],
      ensure: async () => {
        await ensureSpy();
        loaded = true;
      },
      animate: animateSpy,
    };
    adapterRegistry.register({ name: lazyAdapter.name, adapter: lazyAdapter, priority: 1, capabilities: ['layout'] });

    // 1. Deferred load completes and starts real animation
    const el1 = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const c1 = flip(el1 as any, () => el1.setRect({ left: 100, top: 50 }), { adapter: lazyAdapter.name });
    expect(el1.style.transform).toBe('translate3d(-100px, -50px, 0)');
    expect(ensureSpy).toHaveBeenCalledOnce();

    resolveEnsure();
    await vi.waitFor(() => expect(animateSpy).toHaveBeenCalledTimes(2));
    expect(el1.style.transform).toBe('');
    manual.complete();
    await c1.finished;

    // 2. Canceled before deferred load resolves -> restores transform and skips starting
    loaded = false;
    const onCancel = vi.fn();
    const el2 = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const c2 = flip(el2 as any, () => el2.setRect({ left: 80, top: 0 }), { adapter: lazyAdapter.name, onCancel });
    expect(el2.style.transform).toBe('translate3d(-80px, 0px, 0)');

    c2.cancel();
    expect(el2.style.transform).toBe('');
    expect(onCancel).toHaveBeenCalledOnce();
    resolveEnsure();
    await c2.finished;
    // Animate was only called once for el2 (the initial throw), never started after cancel
    expect(animateSpy).toHaveBeenCalledTimes(3);

    // 3. Canceled deferred load with prune: false still clears temporary pending invert
    loaded = false;
    const el3 = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const c3 = flip(el3 as any, () => el3.setRect({ left: 80, top: 0 }), { adapter: lazyAdapter.name, prune: false });
    expect(el3.style.transform).toBe('translate3d(-80px, 0px, 0)');
    c3.cancel();
    expect(el3.style.transform).toBe('');
    resolveEnsure();
    await c3.finished;
  });

  it('settles and unregisters superseded transitions even when canceled animation never resolves finished', async () => {
    const first = createManualControls();
    const second = createManualControls();
    vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(first.controls)
      .mockReturnValueOnce(second.controls);

    const onFirstComplete = vi.fn();
    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const c1 = flip(el as any, () => el.setRect({ left: 100, top: 0 }), { onComplete: onFirstComplete });
    expect(stateManager.count).toBe(1);

    const c2 = flip(el as any, () => el.setRect({ left: 200, top: 0 }));
    await c1.finished;
    await Promise.resolve();

    expect(first.cancelSpy).toHaveBeenCalledOnce();
    expect(onFirstComplete).not.toHaveBeenCalled();
    expect(stateManager.count).toBe(1);

    second.complete();
    await c2.finished;
    await Promise.resolve();
    expect(stateManager.count).toBe(0);
  });

  it('reads ctrl.finished once so single-resolver thenables (Anime.js v4) still prune transforms', async () => {
    let resolver: (() => void) | undefined;
    const singleSubscriberThenable = {
      then(onFulfilled?: () => void) {
        resolver = onFulfilled;
      },
    };
    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const singleSubControls: MorphControls = {
      play: () => {},
      pause: () => {},
      reverse: () => {},
      cancel: () => {},
      finish: () => {},
      restart: () => {},
      duration: 0.4,
      progress: 0,
      currentTime: 0,
      playState: 'running',
      commitStyles: () => {},
      get finished() {
        return Promise.resolve(singleSubscriberThenable as any);
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(singleSubscriberThenable as any).then(onFulfilled, onRejected);
      },
    };
    vi.spyOn(motionAdapter, 'animate').mockImplementation(() => {
      el.style.transform = 'translateX(0px)';
      return singleSubControls;
    });

    const controls = flip(el as any, () => el.setRect({ left: 100, top: 0 }));
    expect(controls.duration).toBe(0.4);
    expect(el.style.transform).toBe('translateX(0px)');

    // Promise.resolve(thenable) invokes thenable.then() on the next microtask
    await Promise.resolve();
    expect(resolver).toBeTypeOf('function');
    resolver?.();
    await controls.finished;
    expect(el.style.transform).toBe('');
  });

  it('falls back to another installed engine when default motion peer fails to load', async () => {
    const manual = createManualControls();
    vi.spyOn(motionAdapter, 'animate').mockImplementation(() => {
      throw new Error('motion not loaded');
    });
    vi.spyOn(motionAdapter, 'ensure').mockRejectedValueOnce(new Error('Cannot find package motion'));
    vi.spyOn(animeAdapter, 'ensure').mockResolvedValueOnce({} as any);
    const animeSpy = vi.spyOn(animeAdapter, 'animate').mockReturnValueOnce(manual.controls);

    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const controls = flip(el as any, () => el.setRect({ left: 120, top: 0 }));

    await vi.waitFor(() => expect(animeSpy).toHaveBeenCalledOnce());
    manual.complete();
    await controls.finished;
  });

  it('cancels previous custom layout adapter run when superseded', async () => {
    const first = createManualControls();
    const second = createManualControls();
    const layoutSpy = vi.fn()
      .mockReturnValueOnce(first.controls)
      .mockReturnValueOnce(second.controls);
    const custom: IAnimationAdapter = {
      name: 'custom-layout-interrupt',
      capabilities: ['layout'],
      animate: () => createNoopControls(),
      layout: layoutSpy,
    };
    adapterRegistry.register({ name: custom.name, adapter: custom, priority: 1, capabilities: ['layout'] });

    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const c1 = flip(el as any, () => el.setRect({ left: 100, top: 0 }), { adapter: custom.name });
    const c2 = flip(el as any, () => el.setRect({ left: 200, top: 0 }), { adapter: custom.name });

    await c1.finished;
    expect(first.cancelSpy).toHaveBeenCalledOnce();
    second.complete();
    await c2.finished;

    // Direct cancel on custom layout adapter unregisters from stateManager even if finished stays pending
    const third = createManualControls();
    layoutSpy.mockReturnValueOnce(third.controls);
    const c3 = flip(el as any, () => el.setRect({ left: 300, top: 0 }), { adapter: custom.name });
    expect(stateManager.count).toBe(1);
    c3.cancel();
    expect(stateManager.count).toBe(0);
  });

  it('re-observes finished on restart() and suppresses onComplete on partial supersede', async () => {
    let resolveRun!: () => void;
    let currentFinished = new Promise<void>(resolve => { resolveRun = resolve; });
    const restartable: MorphControls = {
      play: () => {},
      pause: () => {},
      reverse: () => {},
      cancel: () => {},
      finish: () => {},
      restart: () => {
        currentFinished = new Promise<void>(resolve => { resolveRun = resolve; });
      },
      progress: 0,
      currentTime: 0,
      playState: 'running',
      commitStyles: () => {},
      get finished() { return currentFinished; },
      then: (onFulfilled, onRejected) => currentFinished.then(onFulfilled, onRejected),
    };
    vi.spyOn(motionAdapter, 'animate').mockReturnValueOnce(restartable);

    const onComplete = vi.fn();
    const el = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    const controls = flip(el as any, () => el.setRect({ left: 100, top: 0 }), { onComplete });

    resolveRun();
    await controls.finished;
    await Promise.resolve();
    expect(onComplete).toHaveBeenCalledTimes(1);

    controls.restart();
    await Promise.resolve();
    await Promise.resolve();
    // Should not fire onComplete early while replayed run is still pending
    expect(onComplete).toHaveBeenCalledTimes(1);

    resolveRun();
    await controls.finished;
    await Promise.resolve();
    expect(onComplete).toHaveBeenCalledTimes(2);

    // Partial supersede: superseding 1 of 2 elements suppresses original group's onComplete
    const mA = createManualControls();
    const mB = createManualControls();
    const mA2 = createManualControls();
    vi.spyOn(motionAdapter, 'animate')
      .mockReturnValueOnce(mA.controls)
      .mockReturnValueOnce(mB.controls)
      .mockReturnValueOnce(mA2.controls);

    const onGroupComplete = vi.fn();
    const a = new FakeElement({ left: 0, top: 0, width: 50, height: 50 });
    const b = new FakeElement({ left: 60, top: 0, width: 50, height: 50 });
    const group = flip([a, b] as any, () => {
      a.setRect({ left: 60, top: 0 });
      b.setRect({ left: 0, top: 0 });
    }, { onComplete: onGroupComplete });

    const replacement = flip(a as any, () => a.setRect({ left: 120, top: 0 }));
    mB.complete();
    await group.finished;
    await Promise.resolve();
    expect(onGroupComplete).not.toHaveBeenCalled();

    mA2.complete();
    await replacement.finished;
  });
});
