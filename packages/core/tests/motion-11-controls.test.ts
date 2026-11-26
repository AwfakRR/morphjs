import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { wrapMotionControls } from '../src/adapters/motion-adapter';
import { wrap } from '../../morph-stripped/src/engine';

// Run Motion 11's actual accelerated track against a controllable WAAPI boundary.
class NativeAnimation {
  currentTime: number | null = 0;
  playbackRate = 1;
  playState = 'running';
  onfinish: (() => void) | null = null;

  play() {
    this.playState = 'running';
    this.currentTime ??= this.playbackRate < 0 ? 600 : 0;
  }

  cancel() {
    this.currentTime = null;
    this.playState = 'idle';
  }

  finishAt(time: number) {
    this.currentTime = time;
    this.playState = 'finished';
    this.onfinish?.();
  }
}

class TestElement {
  style = { opacity: '0.2' };
  animation = new NativeAnimation();
  animate() { return this.animation; }
}

let motion: typeof import('motion-11');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', TestElement);
  vi.stubGlobal('HTMLElement', TestElement);
  vi.stubGlobal('SVGElement', class {});
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  motion = createRequire(import.meta.url)('motion-11');
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each([
  ['core', (group: any) => wrapMotionControls(group)],
  ['stripped', (group: any) => wrap(group, 'm', motion.frame)],
] as const)('%s Motion 11 accelerated controls', (_name, wrapControls) => {
  it.each([false, true])('reverses opacity to its first keyframe (finished forward: %s)', async (finishedForward) => {
    const target = new TestElement();
    const onComplete = vi.fn();
    const group = motion.animate(target as unknown as HTMLElement, { opacity: [0.2, 0.8] }, {
      delay: 0.1, duration: 0.5, ease: 'linear', onComplete,
    });
    const controls = wrapControls(group);
    try {
      await vi.advanceTimersByTimeAsync(32);
      expect(target.animation.onfinish).toBeTypeOf('function');
      if (finishedForward) {
        target.animation.finishAt(600);
        await vi.advanceTimersByTimeAsync(32);
        expect(Number(target.style.opacity)).toBe(0.8);
      } else {
        target.animation.currentTime = 350;
      }

      controls.reverse();
      expect(target.animation.playbackRate).toBe(-1);
      expect(target.animation.currentTime).toBe(finishedForward ? 600 : 350);
      expect(target.animation.playState).toBe('running');

      target.animation.finishAt(0);
      await vi.advanceTimersByTimeAsync(32);
      expect(Number(target.style.opacity)).toBe(0.2);
      expect(onComplete).toHaveBeenCalledTimes(finishedForward ? 2 : 1);
    } finally {
      controls.cancel();
    }
  });
});
