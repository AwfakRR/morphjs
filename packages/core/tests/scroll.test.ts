import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animate, configure, scroll, stateManager } from '../src/index';
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
      trigger: shortTarget, pin: true, start: 'top top', end: expect.any(Function),
    }));
    const [{ end }] = create.mock.lastCall!;
    expect(end()).toBe('clamp(top+=600px top)');
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
    create.mockReturnValue({ kill: vi.fn() });
    await scroll(vi.fn(), { container, axis: 'x', scrub: true }).finished;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      scroller: container, horizontal: true, start: 0, end: 'max',
    }));
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
