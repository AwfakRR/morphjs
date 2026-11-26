import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animate, scroll, stateManager } from '../src/index';
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
  const root = {} as Element;
  const container = {} as Element;

  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('Element', class {});
  });

  afterEach(() => {
    stateManager.cancelAll();
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

  it.each([{ pin: true }, { scrub: 0.5 }, { pin: true, scrub: true }])(
    'routes callback tracking with %o to GSAP and forwards the options',
    async options => {
      const kill = vi.fn();
      create.mockReturnValue({ kill });
      const callback = vi.fn();
      const controls = scroll(callback, { ...options, container });
      await controls.finished;

      expect(create).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        trigger: root, scroller: container, ...options,
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
    const controls = scroll(animated, { engine: 'gsap', target: root, container, pin: true, scrub });

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      animation: playheadTween, pin: true, scrub: scrub ?? true, trigger: root, scroller: container,
    }));
    expect(pause).toHaveBeenCalledOnce();
    const [playhead, vars] = to.mock.lastCall!;
    expect(vars).toMatchObject({ progress: 1, ease: 'none', paused: true });
    playhead.progress = 0.4;
    vars.onUpdate();
    playhead.progress = 0.1;
    vars.onUpdate();
    expect(seek.mock.calls).toEqual([[0.8], [0.2]]);

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
});
