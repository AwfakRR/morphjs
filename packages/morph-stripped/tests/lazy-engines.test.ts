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

it('loads only the engine and GSAP plugin requested by each operation', async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  const { animate, scroll: trackScroll, loadGsap } = await import('../src/index');
  await vi.dynamicImportSettled();
  expect(motion).not.toHaveBeenCalled();
  expect(anime).not.toHaveBeenCalled();
  expect(gsap.registerPlugin).not.toHaveBeenCalled();

  await animate({}, { x: 10 }, { engine: 'gsap' }).finished;
  expect(gsap.to).toHaveBeenCalledOnce();
  expect(scroll).not.toHaveBeenCalled();
  expect(morph).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();

  const callback = vi.fn();
  const target = {} as Element;
  const first = trackScroll(callback, { target, engine: 'gsap' });
  const second = trackScroll(callback, { target, engine: 'gsap' });
  await Promise.all([first.finished, second.finished]);
  expect(scroll).toHaveBeenCalledOnce();
  expect(trigger.create).toHaveBeenCalledTimes(2);
  expect(gsap.registerPlugin).toHaveBeenCalledOnce();
  expect(gsap.registerPlugin).toHaveBeenCalledWith(trigger);
  expect(morph).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();

  await expect(loadGsap()).resolves.toMatchObject({ gsap, ScrollTrigger: trigger, MorphSVGPlugin: {}, DrawSVGPlugin: {} });
  expect(morph).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledOnce();
});
