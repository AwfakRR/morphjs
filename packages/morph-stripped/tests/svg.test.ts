import 'animejs';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('gsap/DrawSVGPlugin', () => ({ DrawSVGPlugin: null }));

const star = 'M100 20 L120 70 L180 80 L130 115 L145 170 L100 140 L55 170 L70 115 L20 80 L80 70 Z';
const circle = 'M 100, 100 m -60, 0 a 60,60 0 1,0 120,0 a 60,60 0 1,0 -120,0';

class SvgPath {
  readonly tagName = 'path';
  readonly style = {};
  d = '';

  getAttribute() { return this.d; }
  setAttribute(_name: string, value: string) { this.d = value; }
  getTotalLength() { return this.d === circle ? 120 * Math.PI : 550; }
  getPointAtLength(length: number) {
    if (this.d !== circle) return { x: 100, y: 20 };
    if (length === 0) return { x: 100, y: 100 };
    const angle = length / 60;
    return { x: 100 - 60 * Math.cos(angle), y: 100 - 60 * Math.sin(angle) };
  }
}

afterEach(() => vi.unstubAllGlobals());

it.each([
  { engine: undefined, direction: 'normal', lengths: [100, 240] },
  { engine: undefined, direction: 'reverse', lengths: [100, 240] },
  { engine: undefined, direction: 'normal', lengths: [100] },
  { engine: 'gsap', direction: 'normal', lengths: [100, 240] },
  { engine: 'gsap', direction: 'reverse', lengths: [100, 240] },
] as const)('draws $lengths with their own offsets (engine=$engine, $direction)', async ({ engine, direction, lengths }) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  const { svg } = await import('../src/api');
  const paths = lengths.map(length => ({
    style: { strokeDasharray: '' },
    strokeDashoffset: 0,
    getTotalLength: () => length,
    setAttribute() {},
  }));
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

it('morphs the playground star into a circle instead of retaining the star commands', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { addEventListener() {}, createElementNS: () => new SvgPath() });
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('HTMLCollection', class {});
  vi.stubGlobal('SVGElement', SvgPath);
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  const { svg } = await import('../src/api');
  const path = new SvgPath();
  path.d = star;
  const controls = svg.morph(path as unknown as SVGPathElement, { d: [star, circle], duration: 1.2, autoplay: false });
  controls.finish();
  await controls.finished;

  const coordinates = path.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  expect(coordinates.slice(0, 2)).toEqual([40, 100]);
  expect(coordinates.length).toBeGreaterThan(20);
  for (let i = 0; i < coordinates.length; i += 2) {
    expect(Math.hypot(coordinates[i] - 100, coordinates[i + 1] - 100)).toBeCloseTo(60, 2);
  }
});
