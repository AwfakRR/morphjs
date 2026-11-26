import 'animejs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { svg } from '../src/index';

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
afterEach(() => vi.unstubAllGlobals());

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
