import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animate, configure, createScope, motionAdapter, scroll, stateManager } from '../src/index';
import { createDeferredControls } from '../src/utils/deferred-controls';
import { createNoopControls } from '../src/utils/controls';

const { create, motionScroll, to } = vi.hoisted(() => ({
  create: vi.fn(),
  motionScroll: vi.fn(),
  to: vi.fn(),
}));
vi.mock('gsap', () => ({ gsap: { registerPlugin: vi.fn(), to } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { create } }));
vi.mock('motion', () => ({ scroll: motionScroll }));

describe('core scroll routing', () => {
  const root = { clientWidth: 1200, clientHeight: 800 } as Element;
  const container = { clientHeight: 600 } as Element;
  const target = { parentNode: container } as unknown as Element;

  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('Element', class {});
  });

  afterEach(() => {
    stateManager.cancelAll();
    configure({ defaultAdapter: undefined });
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps plain callback tracking on Motion', async () => {
    const callback = vi.fn();
    const controls = scroll(callback);
    await controls.finished;
    expect(motionScroll).toHaveBeenCalledWith(callback, undefined);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['motion', 'gsap'])('cleans up scoped %s scroll subscriptions after they are ready', async engine => {
    const stop = vi.fn();
    motionScroll.mockReturnValue(stop);
    create.mockReturnValue({ kill: stop });
    const scope = createScope();
    const first = scope.scroll(vi.fn(), { engine });
    const second = scope.scroll(vi.fn(), { engine });
    await Promise.all([first.finished, second.finished]);
    expect(scope.size).toBe(2);
    first.cancel();
    expect(scope.size).toBe(1);
    scope.revert();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('drives and stops a Motion scroll-linked animation through its core controls', async () => {
    const stop = vi.fn();
    motionScroll.mockReturnValue(stop);
    const pause = vi.fn();
    const seek = vi.fn();
    const cancel = vi.fn();
    const scope = createScope();
    const controls = scope.scroll({ ...createNoopControls(), duration: 2, pause, seek, cancel });
    await controls.finished;

    motionScroll.mock.lastCall![0](0.4);
    expect(pause).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(0.8);
    scope.revert();
    expect(stop).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not attach a native fallback or call a scoped callback after teardown during adapter loading', async () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    const add = vi.spyOn(win, 'addEventListener');
    const error = new Error('Motion is not installed');
    const attach = vi.spyOn(motionAdapter, 'scroll').mockImplementationOnce(() => { throw error; });
    const load = vi.spyOn(motionAdapter, 'ensure').mockRejectedValueOnce(error);
    const callback = vi.fn();
    const scope = createScope();

    try {
      scope.scroll(callback);
      expect(load).toHaveBeenCalledOnce();
      scope.revert();
      await load.mock.results[0].value.catch(() => {});
      expect(callback).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
    } finally {
      attach.mockRestore();
      load.mockRestore();
    }
  });

  it('honors a configured GSAP adapter for plain callback tracking', async () => {
    configure({ defaultAdapter: 'gsap' });
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn()).finished;
    expect(create).toHaveBeenCalledOnce();
    expect(motionScroll).not.toHaveBeenCalled();
  });

  it.each([{ engine: 'motion' }, { adapter: 'motion' }])('respects an explicit %o', async override => {
    configure({ defaultAdapter: 'gsap' });
    const callback = vi.fn();
    const options = { ...override, target, pin: true, scrub: true };
    await scroll(callback, options).finished;
    expect(motionScroll).toHaveBeenCalledWith(callback, options);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([{ pin: true }, { scrub: 0.5 }, { pin: true, scrub: true }])(
    'routes callback tracking with %o to GSAP and forwards the options',
    async options => {
      configure({ defaultAdapter: 'motion' });
      const kill = vi.fn();
      create.mockReturnValue({ kill });
      const callback = vi.fn();
      const controls = scroll(callback, { ...options, target, container });
      await controls.finished;

      expect(create).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        trigger: target, scroller: container, ...options,
      }));
      expect(motionScroll).not.toHaveBeenCalled();
      const [{ onUpdate }] = create.mock.lastCall!;
      onUpdate({ progress: 0.4 });
      expect(callback).toHaveBeenCalledWith(0.4);

      controls.cancel();
      expect(kill).toHaveBeenCalledOnce();
    },
  );

  it.each([0.5, false, undefined])('drives core animation controls with scrub=%s', async scrub => {
    const pause = vi.fn();
    const seek = vi.fn();
    const kill = vi.fn();
    const playheadTween = {};
    const animation = new Element();
    to.mockReturnValueOnce({ pause, seek, duration: () => 2 }).mockReturnValueOnce(playheadTween);
    create.mockReturnValue({ kill });

    const animated = animate(animation, { value: 1 }, { engine: 'gsap', duration: 2 });
    const controls = scroll(animated, { engine: 'gsap', target, container, pin: true, scrub });

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      animation: playheadTween, pin: true, scrub: scrub ?? true, trigger: target, scroller: container,
    }));
    expect(pause).toHaveBeenCalledOnce();
    const [playhead, vars] = to.mock.lastCall!;
    expect(vars).toMatchObject({ progress: 1, ease: 'none', paused: true });
    playhead.progress = 0.4;
    vars.onUpdate();
    playhead.progress = 0.1;
    vars.onUpdate();
    expect(seek.mock.calls).toEqual([[0], [0.8], [0.2]]);

    controls.cancel();
    expect(kill).toHaveBeenCalledOnce();
  });

  it('uses the resolved animation duration when the trigger updates before the animation loads', async () => {
    to.mockReturnValue({});
    create.mockReturnValue({ kill: vi.fn() });
    const deferred = createDeferredControls();
    const pause = vi.fn();
    const seek = vi.fn();
    scroll(deferred.controls, { scrub: true });

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    const [playhead, { onUpdate }] = to.mock.lastCall!;
    playhead.progress = 0.6;
    onUpdate();
    deferred.resolve({ ...createNoopControls(), duration: 2, pause, seek });
    expect(seek).toHaveBeenCalledWith(1.2);
    expect(pause.mock.invocationCallOrder[0]).toBeLessThan(seek.mock.invocationCallOrder[0]);
  });

  it('tracks the page without trying to pin the document root', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    create.mockReturnValue({ kill: vi.fn() });
    try {
      const controls = scroll(vi.fn(), { pin: true });
      await controls.finished;
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        trigger: root, pin: false, start: 0, end: 'max',
      }));
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('does not pause the supplied animation when ScrollTrigger creation fails', async () => {
    const kill = vi.fn();
    to.mockReturnValue({ kill });
    create.mockImplementation(() => { throw Error('trigger creation failed'); });
    const pause = vi.fn();
    const seek = vi.fn();
    const animation = { ...createNoopControls(), pause, seek };

    await scroll(animation, { target, pin: true }).finished;
    expect(create).toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
    expect(kill).toHaveBeenCalled();
  });

  it('lets GSAP clamp the default pin range for a short final target', async () => {
    const shortTarget = { parentNode: container, clientHeight: 100 } as unknown as Element;
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), { target: shortTarget, container, pin: true }).finished;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      trigger: shortTarget, pin: true, start: 'top top', end: 'clamp(top top-=100%)',
    }));
  });

  it('lets GSAP size the default pin range against the viewport for an explicit body scroller', async () => {
    const body = { clientHeight: 1760 } as Element;
    vi.stubGlobal('document', { documentElement: root, body });
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), { target, container: body, pin: true }).finished;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      scroller: body, start: 'top top', end: 'clamp(top top-=100%)',
    }));
  });

  it.each(['implicit', 'body', 'root'] as const)('excludes the vertical scrollbar from horizontal page pin travel (%s)', async scroller => {
    const viewport = { ...root, clientWidth: 1145 } as Element;
    const body = { clientWidth: 3700 } as Element;
    vi.stubGlobal('document', { documentElement: viewport, body });
    vi.stubGlobal('window', { innerWidth: 1160 });
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), {
      target, container: scroller === 'body' ? body : scroller === 'root' ? viewport : undefined,
      axis: 'x', pin: true,
    }).finished;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      horizontal: true, start: 'left left', end: expect.any(Function),
    }));
    const [{ end }] = create.mock.lastCall!;
    expect(end()).toBe('clamp(left left-=1145px)');
  });

  it.each([
    { offset: ['start end', 'end start'] as const, start: 'left right', end: 'right left' },
    { offset: [0.25, '80% 20px'] as const, start: '25% 25%', end: '80% 20px' },
  ])('maps horizontal offsets $offset to ScrollTrigger intersections', async ({ offset, start, end }) => {
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), { target, container, pin: true, axis: 'x', offset: [...offset] }).finished;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ horizontal: true, start, end }));
  });

  it('tracks the full horizontal range when a scroller has no target', async () => {
    const bordered = { clientWidth: 272, offsetWidth: 320, scrollWidth: 960 };
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), { container: bordered as Element, axis: 'x', scrub: true }).finished;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      scroller: bordered, horizontal: true, start: 0, end: expect.any(Function),
    }));
    const [{ end, onRefresh }] = create.mock.lastCall!;
    expect(end()).toBe(688);

    const setPositions = vi.fn();
    onRefresh({ end: 688, setPositions });
    expect(setPositions).not.toHaveBeenCalled();
    bordered.scrollWidth += 100;
    onRefresh({ end: 688, setPositions });
    expect(setPositions).toHaveBeenCalledWith(0, 788);
  });

  it('resolves viewport units as pixels on ScrollTrigger refresh', async () => {
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), { target, container, scrub: true, offset: ['10vw 25vh', 'end'] }).finished;
    const [{ horizontal, start, end }] = create.mock.lastCall!;
    expect(horizontal).toBe(false);
    expect(start()).toBe('120px 200px');
    expect(end).toBe('bottom bottom');
  });
});
