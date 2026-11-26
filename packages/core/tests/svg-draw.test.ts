import 'animejs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adapterRegistry, configure, stateManager, svg } from '../src/index';
import { animeAdapter } from '../src/adapters/anime-adapter';
import { ensureMotion } from '../src/adapters/motion-adapter';
import { createNoopControls } from '../src/utils/controls';

vi.mock('gsap/DrawSVGPlugin', () => ({ DrawSVGPlugin: null }));

class Path {
  strokeDashoffset = 0;
  style = { strokeDasharray: '' };
  constructor(private length: number) {}
  getTotalLength() { return this.length; }
  setAttribute() {}
}

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  vi.stubGlobal('Element', Path);
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('SVGGeometryElement', Path);
});
afterEach(() => {
  configure({ reducedMotion: 'user' });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('passes numeric endpoints to third-party adapters and completes once', async () => {
  const name = 'recording-svg-draw';
  const draw = vi.fn(createNoopControls);
  const onComplete = vi.fn();
  adapterRegistry.register({ name, capabilities: ['svg'], adapter: { name, capabilities: ['svg'], animate: draw, svg: draw } });
  const paths = [new Path(100), new Path(240)];
  const targets = paths as unknown as SVGPathElement[];

  await svg.draw(targets, { adapter: name, delay: (index, total) => index / total, onComplete }).finished;

  expect(draw).toHaveBeenNthCalledWith(1, [paths[0]], { strokeDashoffset: [100, 0] }, expect.objectContaining({ delay: 0 }));
  expect(draw).toHaveBeenNthCalledWith(2, [paths[1]], { strokeDashoffset: [240, 0] }, expect.objectContaining({ delay: 0.5 }));
  expect(onComplete).toHaveBeenCalledOnce();
});

it.each([
  { engine: undefined, direction: 'normal', lengths: [100, 240] },
  { engine: undefined, direction: 'reverse', lengths: [100, 240] },
  { engine: undefined, direction: 'normal', lengths: [100] },
  { engine: 'gsap', direction: 'normal', lengths: [100, 240] },
  { engine: 'gsap', direction: 'reverse', lengths: [100, 240] },
] as const)('draws $lengths with their own offsets (engine=$engine, $direction)', async ({ engine, direction, lengths }) => {
  const paths = lengths.map(length => new Path(length));
  const targets = paths as unknown as SVGPathElement[];
  const controls = svg.draw(targets.length === 1 ? targets[0] : targets, {
    engine, direction, duration: 1, ease: 'linear', autoplay: false,
  });
  const offsets = () => paths.map(path => path.strokeDashoffset);

  try {
    controls.seek?.(0.5);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.5));
    expect(offsets()).toEqual(lengths.map(length => length / 2));
    expect(paths.map(path => path.style.strokeDasharray)).toEqual(lengths.map(String));

    controls.seek?.(0);
    expect(offsets()).toEqual(lengths.map(length => direction === 'reverse' ? 0 : length));
    controls.seek?.(1);
    expect(offsets()).toEqual(lengths.map(length => direction === 'reverse' ? length : 0));
  } finally {
    controls.cancel();
  }
});

async function motionPaths() {
  class MotionPath extends Path {
    readonly ownerSVGElement = {};
    readonly style = { strokeDasharray: '', strokeDashoffset: '0' };
    getAttribute() { return null; }
  }

  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  await ensureMotion();
  const paths = [new MotionPath(100), new MotionPath(240)];
  return {
    targets: paths as unknown as SVGPathElement[],
    offsets: () => paths.map(path => Number(path.style.strokeDashoffset)),
  };
}

it('repeats each Motion stroke after its own stagger and completes once', async () => {
  const { targets, offsets } = await motionPaths();
  const onComplete = vi.fn();
  const controls = svg.draw(targets, {
    engine: 'motion', duration: 0.2, ease: 'linear', delay: index => index * 0.1, repeat: 1,
    onComplete,
  });

  await vi.advanceTimersByTimeAsync(256);
  const [short, long] = offsets();
  expect(short).toBeGreaterThan(60); // The first stroke is drawing for the second time.
  expect(long).toBeLessThan(100); // The delayed stroke is still finishing its first draw.
  expect(onComplete).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(280);
  expect(onComplete).toHaveBeenCalledOnce();
  await controls.finished;
  expect(offsets()).toEqual([0, 0]);
});

it('pauses and plays both Motion strokes with one controls object', async () => {
  const { targets, offsets } = await motionPaths();
  const controls = svg.draw(targets, { engine: 'motion', duration: 0.2, ease: 'linear', autoplay: false });

  await vi.advanceTimersByTimeAsync(128);
  const paused = offsets();
  controls.play();
  await vi.advanceTimersByTimeAsync(112);
  const midpoints = offsets();
  expect(midpoints[0]).not.toBe(paused[0]);
  expect(midpoints[1] / 240).toBeCloseTo(midpoints[0] / 100);

  controls.pause();
  await vi.advanceTimersByTimeAsync(400);
  expect(offsets()).toEqual(midpoints);
  controls.play();
  await vi.advanceTimersByTimeAsync(400);
  await controls.finished;
  expect(offsets()).toEqual([0, 0]);
});

it.each(['play', 'resume', 'cancel'] as const)('handles %s after the first Motion stroke finishes', async action => {
  const { targets, offsets } = await motionPaths();
  const onComplete = vi.fn(offsets);
  const controls = svg.draw(targets, {
    engine: 'motion', duration: 0.18, ease: 'linear', delay: index => index * 0.14, onComplete,
  });

  await vi.advanceTimersByTimeAsync(224);
  expect(offsets()[0]).toBe(0);
  expect(offsets()[1]).toBeGreaterThan(0);
  if (action === 'cancel') {
    expect(stateManager.getRunning()).toContainEqual(expect.objectContaining({ controls }));
    controls.cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(offsets()).toEqual([100, 240]);
    expect(onComplete).not.toHaveBeenCalled();
    expect(stateManager.getRunning()).not.toContainEqual(expect.objectContaining({ controls }));
    return;
  }

  if (action === 'resume') controls.pause();
  controls.play();
  await vi.advanceTimersByTimeAsync(48);
  expect(offsets()[0]).toBe(0);
  expect(onComplete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100);
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onComplete).toHaveReturnedWith([0, 0]);
});

it('uses each path length in the Motion fallback when Anime is unavailable', async () => {
  const { targets, offsets } = await motionPaths();
  const unavailable = () => { throw new Error('Anime unavailable'); };
  vi.spyOn(animeAdapter, 'svg').mockImplementation(unavailable);
  vi.spyOn(animeAdapter, 'ensure').mockRejectedValue(new Error('Anime unavailable'));

  const controls = svg.draw(targets, { duration: 0.2, ease: 'linear' });
  await vi.advanceTimersByTimeAsync(112);
  const [short, long] = offsets();
  expect(short).toBeGreaterThan(0);
  expect(short).toBeLessThan(100);
  expect(long / 240).toBeCloseTo(short / 100);
  await vi.advanceTimersByTimeAsync(200);
  await controls.finished;
  expect(offsets()).toEqual([0, 0]);
});

it('resets both Motion strokes when canceled during staggered reverse playback', async () => {
  const { targets, offsets } = await motionPaths();
  const onComplete = vi.fn();
  const controls = svg.draw(targets, {
    engine: 'motion', duration: 0.5, ease: 'linear', delay: index => index * 0.14, onComplete,
  });
  await vi.advanceTimersByTimeAsync(400);
  controls.reverse();
  await vi.advanceTimersByTimeAsync(320);
  expect(offsets()[0]).toBeLessThan(100);
  expect(offsets()[1]).toBe(240);

  controls.cancel();
  await vi.advanceTimersByTimeAsync(64);
  expect(offsets()).toEqual([100, 240]);
  expect(onComplete).not.toHaveBeenCalled();
});

it('commits each final Motion erase offset before reduced-motion completion', async () => {
  const { targets, offsets } = await motionPaths();
  configure({ reducedMotion: 'always' });
  const onComplete = vi.fn(offsets);
  const controls = svg.draw(targets, { engine: 'motion', direction: 'reverse', onComplete });

  await vi.advanceTimersByTimeAsync(128);
  await controls.finished;
  expect(offsets()).toEqual([100, 240]);
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onComplete).toHaveReturnedWith([100, 240]);
});
