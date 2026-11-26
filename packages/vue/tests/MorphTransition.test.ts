import { beforeEach, describe, expect, it, vi } from 'vitest';
import { animate } from 'morphjs';
import { MorphTransition, type MorphTransitionProps } from '../src/MorphTransition';

vi.mock('morphjs', () => ({
  animate: vi.fn(() => Promise.resolve()),
}));

const el = {} as Element;

describe.each([
  ['enter', 'onEnter'],
  ['leave', 'onLeave'],
] as const)('MorphTransition %s', (phase, hook) => {
  function runHook(props: MorphTransitionProps) {
    const transition = MorphTransition(props, { attrs: {}, slots: {}, emit: vi.fn() });
    const done = vi.fn();
    transition.props![hook](el, done);
    return done;
  }

  beforeEach(() => vi.clearAllMocks());

  it('passes the shared duration as an animation option and waits for completion', async () => {
    const keyframes = { opacity: [0, 1] };
    const done = runHook({ [phase]: keyframes, duration: 0.75 });

    expect(animate).toHaveBeenCalledWith(el, keyframes, { duration: 0.75 });
    expect(done).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(done).toHaveBeenCalledOnce();
  });

  it('lets a phase duration override the shared duration, including zero', () => {
    const keyframes = { opacity: [0, 1] };
    runHook({ [phase]: { ...keyframes, duration: 0 }, duration: 0.75 });

    expect(animate).toHaveBeenCalledWith(el, keyframes, { duration: 0 });
  });

  it('passes the spring configuration as an animation option', () => {
    const keyframes = { x: [0, 100] };
    const spring = { stiffness: 400, damping: 12 };
    runHook({ [phase]: keyframes, spring });

    expect(animate).toHaveBeenCalledWith(el, keyframes, { spring });
  });

  it('completes immediately when the phase has no keyframes', () => {
    const done = runHook({});

    expect(animate).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
  });
});
