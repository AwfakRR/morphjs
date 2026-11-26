import { afterEach, expect, it, vi } from 'vitest';

const { motion, anime, gsap, scroll, morph, draw, trigger } = vi.hoisted(() => ({
  motion: vi.fn(),
  anime: vi.fn(),
  gsap: { to: vi.fn(() => ({})), registerPlugin: vi.fn() },
  scroll: vi.fn(),
  morph: vi.fn(),
  draw: vi.fn(),
  trigger: { create: vi.fn(() => ({ kill: vi.fn() })) },
}));

vi.mock('motion', () => { motion(); return {}; });
vi.mock('animejs', () => { anime(); return {}; });
vi.mock('gsap', () => ({ gsap }));
vi.mock('gsap/ScrollTrigger', () => { scroll(); return { ScrollTrigger: trigger }; });
vi.mock('gsap/MorphSVGPlugin', () => { morph(); return { MorphSVGPlugin: {} }; });
vi.mock('gsap/DrawSVGPlugin', () => { draw(); return { DrawSVGPlugin: {} }; });

afterEach(() => vi.unstubAllGlobals());

it('defers browser imports and initializes ScrollTrigger on the first GSAP scroll', async () => {
  vi.stubGlobal('window', new EventTarget());
  const { gsapAdapter, scroll: trackScroll } = await import('../src/index');
  await vi.dynamicImportSettled();
  expect(motion).not.toHaveBeenCalled();
  expect(anime).not.toHaveBeenCalled();
  expect(gsap.registerPlugin).not.toHaveBeenCalled();

  await gsapAdapter.ensure?.();
  gsapAdapter.animate({}, { x: 10 });
  expect(gsap.to).toHaveBeenCalledOnce();
  expect(scroll).not.toHaveBeenCalled();
  expect(morph).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();

  const target = {} as Element;
  const callback = vi.fn();
  const options = { target, engine: 'gsap' };
  await Promise.all([trackScroll(callback, options).finished, trackScroll(callback, options).finished]);
  expect(scroll).toHaveBeenCalledOnce();
  expect(trigger.create).toHaveBeenCalledTimes(2);
  expect(gsap.registerPlugin).toHaveBeenCalledOnce();
  expect(gsap.registerPlugin).toHaveBeenCalledWith(trigger);
  expect(morph).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();
});
