import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { animeAdapter, createScope, gsapAdapter, morph, motionAdapter, stateManager, type MorphTargets } from '../src/index';
import { ensureMotion } from '../src/adapters/motion-adapter';
import { createDeferredControls } from '../src/utils/deferred-controls';

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  await gsapAdapter.ensure!();
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('SVGElement', class {});
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('HTMLCollection', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  await Promise.all([ensureMotion(), animeAdapter.ensure!()]);
});

function makeScroller() {
  const root = Object.assign(new EventTarget(), {
    clientWidth: 100, clientHeight: 100, scrollWidth: 100, scrollHeight: 500, scrollLeft: 0, scrollTop: 0,
  });
  const win = new EventTarget();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { documentElement: root, scrollingElement: root }));
  return (top: number) => {
    root.scrollTop = top;
    win.dispatchEvent(new Event('scroll'));
  };
}

afterEach(() => vi.restoreAllMocks());

afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('cancels running tweens, springs and timelines without signaling completion', async () => {
  const scope = morph.scope();
  const targets = Array.from({ length: 3 }, () => ({ value: 0 }));
  const controls = [
    scope.animate(targets[0] as unknown as MorphTargets, { value: 100 }, 1),
    scope.spring(targets[1] as unknown as MorphTargets, { value: 100 }),
    scope.timeline({ defaults: { duration: 1 } })
      .add(targets[2] as unknown as MorphTargets, { value: 100 }),
  ];
  const finished = vi.fn();
  controls.forEach(control => void control.finished.then(finished));
  const cleanup = vi.fn();
  vi.spyOn(motionAdapter, 'gesture').mockReturnValue({ cleanup });
  scope.gesture([], { hover: true });

  try {
    await vi.advanceTimersByTimeAsync(96);
    for (const { value } of targets) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(100);
    }
    expect(scope.size).toBe(4);
    scope.revert();
    expect(scope.size).toBe(0);
    expect(cleanup).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(32);
    const stopped = targets.map(target => target.value);
    await vi.advanceTimersByTimeAsync(1500);
    expect(targets.map(target => target.value)).toEqual(stopped);
    expect(finished).not.toHaveBeenCalled();
  } finally {
    scope.revert();
  }
});

it('removes completed, canceled and rejected controls and supports reuse', async () => {
  const scope = createScope();
  const target = { value: 0 } as unknown as MorphTargets;
  const finished = scope.animate(target, { value: 100 }, 0.1);
  const canceled = scope.spring({ value: 0 } as unknown as MorphTargets, { value: -100 });
  const rejected = createDeferredControls();
  expect(scope.add(rejected.controls)).toBe(rejected.controls);
  expect(scope.add(finished)).toBe(finished);
  expect(scope.size).toBe(3);

  canceled.cancel();
  expect(scope.size).toBe(2);
  rejected.reject(new Error('animation failed'));
  await vi.advanceTimersByTimeAsync(300);
  expect(scope.size).toBe(0);

  scope.revert();
  const cleanup = vi.fn();
  scope.add(cleanup);
  scope.revert();
  scope.revert();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(scope.size).toBe(0);
});

it('drops a canceled timeline before its scheduled autoplay can build it', async () => {
  const scope = createScope();
  const build = vi.spyOn(animeAdapter, 'timeline');
  const target = { value: 0 };
  const timeline = scope.timeline().add(target as unknown as MorphTargets, { value: 100 });

  timeline.cancel();
  expect(scope.size).toBe(0);
  await vi.advanceTimersByTimeAsync(96);
  expect(build).not.toHaveBeenCalled();
  expect(target.value).toBe(0);
});

it('does not rerun a gesture cleanup that was already called', () => {
  const scope = createScope();
  const cleanup = vi.fn();
  vi.spyOn(motionAdapter, 'gesture').mockReturnValue({ cleanup });
  const stop = scope.gesture([], { hover: true });
  stop();
  scope.revert();
  stop();
  expect(scope.size).toBe(0);
  expect(cleanup).toHaveBeenCalledOnce();
});

it('continues cleanup after an entry throws', () => {
  const scope = createScope();
  const error = new Error('cleanup failed');
  const cleanup = vi.fn();
  scope.add(() => { throw error; });
  scope.add(cleanup);
  expect(() => scope.revert()).toThrow(error);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(scope.size).toBe(0);
});

it('unregisters a completed scoped Anime SVG tween and leaves its final value intact', async () => {
  const scope = createScope();
  const target = { value: 0 };
  const controls = scope.svg.attr(target as unknown as MorphTargets, { value: [0, 100] }, { duration: 0.1 });

  try {
    expect(stateManager.getRunning().some(item => item.controls === controls)).toBe(true);
    await vi.advanceTimersByTimeAsync(320);
    expect(target.value).toBe(100);
    expect(scope.size).toBe(0);
    expect(stateManager.getRunning().some(item => item.controls === controls)).toBe(false);
    stateManager.cancelAll();
    expect(target.value).toBe(100);
  } finally {
    scope.revert();
    stateManager.cancelAll();
  }
});

it('keeps an autoplay timeline paused between Motion scroll updates', async () => {
  const scrollTo = makeScroller();
  const scope = createScope();
  const target = { value: 0 };
  const timeline = scope.timeline({ defaults: { duration: 1, ease: 'linear' } })
    .add(target as unknown as MorphTargets, { value: 100 });
  scope.scroll(timeline);

  try {
    await vi.advanceTimersByTimeAsync(240);
    expect(target.value).toBe(0);
    scrollTo(200);
    await vi.advanceTimersByTimeAsync(240);
    expect(target.value).toBeCloseTo(50);
    await vi.advanceTimersByTimeAsync(240);
    expect(target.value).toBeCloseTo(50);
  } finally {
    scope.revert();
  }
});

it('cancels a Motion tween only once when its scroll link belongs to the same scope', async () => {
  makeScroller();
  const scope = createScope();
  const onCancel = vi.fn();
  const tween = scope.animate({ value: 0 } as unknown as MorphTargets, { value: [0, 100] }, { onCancel });
  scope.scroll(tween);
  await vi.advanceTimersByTimeAsync(48);

  scope.revert();
  expect(onCancel).toHaveBeenCalledOnce();
});

it.each([false, true])('cancels a tween once before its Motion scroll link loads (owns tween: %s)', async ownsTween => {
  makeScroller();
  const scope = createScope();
  const onCancel = vi.fn();
  const target = { value: 0 };
  const tween = morph.animate(target as unknown as MorphTargets, { value: 100 }, { duration: 1, onCancel });
  if (ownsTween) scope.add(tween);
  const scroll = vi.spyOn(motionAdapter, 'scroll').mockImplementationOnce(() => { throw new Error('Motion loading'); });
  const add = vi.spyOn(window, 'addEventListener');
  try {
    scope.scroll(tween);
    scope.revert();
    await vi.advanceTimersByTimeAsync(200);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(target.value).toBe(0);
    expect(scroll).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalledWith('scroll', expect.any(Function), expect.anything());
  } finally {
    scope.revert();
    if (!onCancel.mock.calls.length) tween.cancel();
  }
});

it.each(['seek', 'reverse'])('tracks a finished Anime tween after %s and restart', async action => {
  const scope = createScope();
  const target = { value: 0 };
  const tween = scope.animate(target as unknown as MorphTargets, { value: [0, 100] }, { engine: 'anime', duration: 0.4 });

  try {
    await vi.advanceTimersByTimeAsync(480);
    expect(scope.size).toBe(0);
    const previous = tween.finished;

    if (action === 'seek') tween.seek?.(0.1);
    else tween.reverse();
    tween.restart();
    expect(tween.finished).not.toBe(previous);
    const completed = vi.fn();
    void tween.then(completed);
    scope.add(tween);
    await vi.advanceTimersByTimeAsync(80);
    expect(completed).not.toHaveBeenCalled();
    expect(scope.size).toBe(1);
    await vi.advanceTimersByTimeAsync(480);
    expect(completed).toHaveBeenCalledOnce();
    expect(scope.size).toBe(0);
  } finally {
    scope.revert();
    tween.cancel();
  }
});

it('exposes the next Anime completion when onComplete restarts the tween', async () => {
  const scope = createScope();
  const replayCompleted = vi.fn();
  let replay: Promise<void> | undefined;
  const tween = scope.animate({ value: 0 } as unknown as MorphTargets, { value: 100 }, {
    engine: 'anime',
    duration: 0.4,
    onComplete: () => {
      if (replay) return;
      tween.restart();
      replay = tween.finished;
      void replay.then(replayCompleted);
    },
  });
  const first = tween.finished;
  const firstCompleted = vi.fn();
  void first.then(firstCompleted);

  try {
    tween.finish();
    await vi.advanceTimersByTimeAsync(80);
    expect(firstCompleted).toHaveBeenCalledOnce();
    expect(replay).not.toBe(first);
    expect(tween.finished).toBe(replay);
    expect(replayCompleted).not.toHaveBeenCalled();
    scope.add(tween);
    await vi.advanceTimersByTimeAsync(80);
    expect(scope.size).toBe(1);
    await vi.advanceTimersByTimeAsync(480);
    expect(replayCompleted).toHaveBeenCalledOnce();
    expect(scope.size).toBe(0);
  } finally {
    scope.revert();
    tween.cancel();
  }
});

it.each(['anime', 'gsap'])('finishes a %s timeline paused before its initial autoplay', async engine => {
  const scope = createScope();
  const target = { value: 0 };
  const timeline = scope.timeline({ engine, defaults: { duration: 1 } })
    .add(target as unknown as MorphTargets, { value: 100 });
  const completed = vi.fn();
  void timeline.finished.then(completed);

  try {
    timeline.pause();
    timeline.finish();
    await vi.advanceTimersByTimeAsync(200);
    expect(target.value).toBe(100);
    expect(completed).toHaveBeenCalledOnce();
    expect(scope.size).toBe(0);
  } finally {
    scope.revert();
  }
});

it.each(['anime', 'gsap'])('tracks a completed %s timeline again when it is restarted and re-added', async engine => {
  const scope = createScope();
  const timeline = scope.timeline({ engine, defaults: { duration: 0.4 } })
    .add({ value: 0 } as unknown as MorphTargets, { value: 100 });
  const cancel = vi.spyOn(timeline, 'cancel');

  try {
    timeline.finish();
    await vi.advanceTimersByTimeAsync(16);
    expect(timeline.playState).toBe('finished');
    expect(scope.size).toBe(0);
    const previous = timeline.finished;

    timeline.restart();
    expect(timeline.finished).not.toBe(previous);
    scope.add(timeline);
    await vi.advanceTimersByTimeAsync(80);
    expect(timeline.playState).toBe('running');
    expect(scope.size).toBe(1);
    timeline.finish();
    await vi.advanceTimersByTimeAsync(16);
    expect(scope.size).toBe(0);

    timeline.restart();
    scope.add(timeline);
    scope.revert();
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    timeline.cancel();
  }
});
