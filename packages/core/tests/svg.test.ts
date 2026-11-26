import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animeAdapter, animationEvents, gsapAdapter, motionAdapter, svg } from '../src/index';
import { createNoopControls } from '../src/api/scroll';

const gsap = vi.hoisted(() => ({
  to: vi.fn(() => ({})),
  fromTo: vi.fn(() => ({})),
  registerPlugin: vi.fn(),
}));
vi.mock('gsap', () => ({ gsap }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: null }));
vi.mock('gsap/MorphSVGPlugin', () => ({ MorphSVGPlugin: {} }));
vi.mock('gsap/DrawSVGPlugin', () => ({ DrawSVGPlugin: {} }));

class Path {
  style = { strokeDasharray: '' };
  setAttribute = vi.fn();
  getTotalLength = () => 120;
}

describe('core SVG helpers', () => {
  let path: SVGPathElement;

  beforeEach(() => {
    path = new Path() as unknown as SVGPathElement;
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { querySelectorAll: () => [path] });
    vi.stubGlobal('Element', Path);
    vi.stubGlobal('NodeList', class {});
    vi.stubGlobal('SVGGeometryElement', Path);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes morph through GSAP MorphSVGPlugin with an explicit adapter', async () => {
    await gsapAdapter.ensure!();
    const d: [string, string] = ['M0 0 L10 0', 'M0 0 L10 10'];
    svg.morph('.path', { d, adapter: 'gsap', duration: 2 });

    expect(gsap.fromTo).toHaveBeenCalledWith([path], { attr: { d: d[0] } }, {
      morphSVG: { shape: d[1] },
      duration: 2,
    });
  });

  it.each([
    ['normal', '0%', '100%'],
    ['reverse', '100%', '0%'],
    ['alternate-reverse', '100%', '0%'],
  ] as const)('routes %s draw through DrawSVGPlugin', async (direction, from, to) => {
    await gsapAdapter.ensure!();
    svg.draw(path, { engine: 'gsap', direction, duration: 2 });

    expect(gsap.fromTo).toHaveBeenCalledWith([path], { drawSVG: from }, {
      drawSVG: to,
      duration: 2,
      ...(direction === 'alternate-reverse' ? { yoyo: true } : {}),
    });
  });

  it('routes attr through the selected adapter SVG path and respects reduced motion', async () => {
    await gsapAdapter.ensure!();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const attributes = { fill: '#ff0000' };
    const emit = vi.spyOn(animationEvents, 'emit');
    const controls = svg.attr(path, attributes, { engine: 'gsap', duration: 2 });
    await controls.finished;

    expect(gsap.to).toHaveBeenCalledWith([path], { attr: attributes, duration: 0 });
    expect(emit.mock.calls.map(([type]) => type)).toEqual(['start', 'complete']);
    for (const [, event] of emit.mock.calls) {
      expect(event.controls).toBe(controls);
      expect(event.target).toBe(path);
    }
  });

  it('passes attribute pairs to GSAP as start and end values', async () => {
    await gsapAdapter.ensure!();
    svg.attr(path, { r: [10, 50], fill: '#ff0000' }, { adapter: 'gsap' });

    expect(gsap.fromTo).toHaveBeenCalledWith([path], { attr: { r: 10 } }, {
      attr: { r: 50, fill: '#ff0000' },
    });
  });

  it('keeps sibling SVG attributes when GSAP morphs the path', async () => {
    await gsapAdapter.ensure!();
    svg.attr(path, { d: ['M0 0 L10 0', 'M0 0 L10 10'], fill: '#ff0000' }, { adapter: 'gsap' });

    expect(gsap.fromTo).toHaveBeenCalledWith([path], { attr: { d: 'M0 0 L10 0' } }, {
      morphSVG: { shape: 'M0 0 L10 10' },
      attr: { fill: '#ff0000' },
    });
  });

  it('draws with Anime by default and keeps the same route after lazy loading', async () => {
    const controls = createNoopControls();
    const pause = vi.spyOn(controls, 'pause');
    const ensure = vi.spyOn(animeAdapter, 'ensure').mockResolvedValue(undefined);
    const animateSvg = vi.spyOn(animeAdapter, 'svg')
      .mockImplementationOnce(() => { throw new Error('Anime not loaded'); })
      .mockReturnValue(controls);
    const animate = vi.spyOn(motionAdapter, 'animate').mockReturnValue(controls);

    const pending = svg.draw('.path', { duration: 2 });
    pending.pause();

    expect(animateSvg).toHaveBeenNthCalledWith(1, [path], { strokeDashoffset: [120, 0] },
      expect.objectContaining({ duration: 2 }));
    await pending.finished;
    expect(ensure).toHaveBeenCalledOnce();
    expect(animateSvg).toHaveBeenCalledTimes(2);
    expect(animate).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalledOnce();
  });

  it('falls back to a tween for an explicitly selected adapter without svg()', () => {
    const controls = createNoopControls();
    const animate = vi.spyOn(motionAdapter, 'animate').mockReturnValue(controls);

    expect(svg.attr(path, { fill: '#ff0000' }, { adapter: 'motion' })).toBe(controls);
    expect(animate).toHaveBeenCalledWith([path], { fill: '#ff0000' },
      expect.objectContaining({ adapter: 'motion' }));
  });

  it('uses a Motion tween when default drawing cannot load Anime', async () => {
    const controls = createNoopControls();
    vi.spyOn(animeAdapter, 'svg').mockImplementation(() => { throw new Error('Anime not loaded'); });
    const ensureAnime = vi.spyOn(animeAdapter, 'ensure').mockRejectedValue(new Error('Anime unavailable'));
    vi.spyOn(motionAdapter, 'ensure').mockResolvedValue(undefined);
    const animate = vi.spyOn(motionAdapter, 'animate').mockReturnValue(controls);

    await svg.draw(path).finished;

    expect(ensureAnime).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith([path], { strokeDashoffset: [120, 0] }, {});
  });

  it('settles controls if neither SVG nor tween engines load', async () => {
    vi.spyOn(animeAdapter, 'svg').mockImplementation(() => { throw new Error('Anime not loaded'); });
    vi.spyOn(animeAdapter, 'ensure').mockRejectedValue(new Error('Anime unavailable'));
    vi.spyOn(motionAdapter, 'ensure').mockRejectedValue(new Error('Motion unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(svg.draw(path).finished).resolves.toBeUndefined();
  });
});
