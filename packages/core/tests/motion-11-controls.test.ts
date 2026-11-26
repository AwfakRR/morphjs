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

  it('preserves the unelapsed part of a JS tween delay when paused', async () => {
    const target = { value: 0 };
    const group = motion.animate(target as any, { value: [0, 100] }, {
      delay: 0.5, duration: 2, ease: 'linear',
    });
    const controls = wrapControls(group);
    try {
      await vi.advanceTimersByTimeAsync(112);
      controls.pause();
      await vi.advanceTimersByTimeAsync(640);
      expect(target.value).toBe(0);

      controls.play();
      await vi.advanceTimersByTimeAsync(320);
      expect(target.value).toBe(0);
      await vi.advanceTimersByTimeAsync(128);
      expect(target.value).toBeGreaterThan(1);
      expect(target.value).toBeLessThan(5);
    } finally {
      controls.cancel();
    }
  });

  it('keeps the rendered playhead when pausing a delayed JS tween twice', async () => {
    const target = { value: 0 };
    const controls = wrapControls(motion.animate(target as any, { value: [0, 100] }, {
      delay: 0.5, duration: 2, ease: 'linear',
    }));
    try {
      await vi.advanceTimersByTimeAsync(1200);
      controls.pause();
      await vi.advanceTimersByTimeAsync(64);
      const pausedValue = target.value;
      const pausedTime = controls.currentTime;
      expect(pausedValue).toBeGreaterThan(30);
      expect(pausedTime).toBeCloseTo(pausedValue / 50);

      controls.pause();
      await vi.advanceTimersByTimeAsync(64);
      expect(target.value).toBe(pausedValue);
      expect(controls.currentTime).toBe(pausedTime);
    } finally {
      controls.cancel();
    }
  });

  it.each(['play', 'reverse'] as const)('keeps a finished delayed track at its endpoint before %s', async (resume) => {
    await vi.advanceTimersByTimeAsync(3000);
    const target = { short: 0, long: 0 };
    const controls = wrapControls(motion.animate(target as any, { short: [0, 100], long: [0, 100] }, {
      duration: 2, delay: 0.5, ease: 'linear',
      short: { duration: 1, delay: 0.5, ease: 'linear' },
    }));
    try {
      await vi.advanceTimersByTimeAsync(1728);
      expect(target.short).toBe(100);
      expect(target.long).toBeGreaterThan(50);
      expect(target.long).toBeLessThan(65);

      controls.pause();
      await vi.advanceTimersByTimeAsync(128);
      const paused = target.long;
      expect(target.short).toBe(100);
      expect(controls.currentTime).toBeGreaterThanOrEqual(1);
      expect(controls.currentTime).toBeLessThan(1.016);

      controls[resume]();
      await vi.advanceTimersByTimeAsync(160);

      if (resume === 'reverse') {
        expect(target.short).toBeGreaterThan(80);
        expect(target.short).toBeLessThan(87);
        expect(target.long).toBeLessThan(paused - 6);
      } else {
        expect(target.short).toBe(100);
        expect(target.long).toBeGreaterThan(paused + 6);
      }
    } finally {
      controls.cancel();
    }
  });
});
