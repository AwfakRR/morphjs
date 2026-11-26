import 'animejs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adapterRegistry, configure, svg } from '../src/index';
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
