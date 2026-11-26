import { afterEach, describe, expect, it, vi } from 'vitest';
import { scroll } from '../src/index';
import type { MorphControls } from '../src/types';

const { create, to } = vi.hoisted(() => ({
  create: vi.fn(),
  to: vi.fn(),
}));
vi.mock('gsap', () => ({ gsap: { registerPlugin: vi.fn(), to } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { create } }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('stripped GSAP scroll', () => {
  it('registers progress updates before cancellation and kills the same trigger', async () => {
    const target = {};
    vi.stubGlobal('document', { documentElement: target });
    const kill = vi.fn();
    create.mockReturnValue({ kill });
    const callback = vi.fn();
    const controls = scroll(callback, { engine: 'gsap' });
    await controls.finished;

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ trigger: target }));
    const [{ onUpdate }] = create.mock.lastCall!;
    onUpdate({ progress: 0.4 });
    expect(callback).toHaveBeenCalledWith(0.4);

    controls.cancel();
    expect(kill).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it('drives the supplied animation from the scrubbed progress', async () => {
    const target = {} as Element;
    vi.stubGlobal('document', { documentElement: {} });
    const tween = { kill: vi.fn() };
    to.mockReturnValue(tween);
    const animation = {
      pause: vi.fn(),
      seek: vi.fn(),
      duration: 2,
    } as unknown as MorphControls;
    const controls = scroll(animation, { engine: 'gsap', target, scrub: 0.5 });
    await controls.finished;

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      animation: tween, scrub: 0.5, trigger: target,
    }));
    expect(animation.pause).toHaveBeenCalledOnce();
    const [playhead, { onUpdate }] = to.mock.lastCall!;
    playhead.progress = 0.4;
    onUpdate();
    expect(animation.seek).toHaveBeenCalledWith(0.8);
    playhead.progress = 0.1;
    onUpdate();
    expect(animation.seek).toHaveBeenLastCalledWith(0.2);

    controls.cancel();
    expect(tween.kill).toHaveBeenCalledOnce();
  });
});
