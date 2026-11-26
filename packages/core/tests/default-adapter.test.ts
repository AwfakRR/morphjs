import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { animate, configure } from '../src/index';
import { resolveAdapter } from '../src/router';
import { gsapAdapter } from '../src/adapters/gsap-adapter';
import { animeAdapter } from '../src/adapters/anime-adapter';
import { motionAdapter } from '../src/adapters/motion-adapter';
import { createNoopControls } from '../src/utils/controls';

describe('configure({ defaultAdapter })', () => {
  beforeAll(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    vi.stubGlobal('Element', class {});
    vi.stubGlobal('NodeList', class {});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    configure({ defaultAdapter: undefined });
    vi.restoreAllMocks();
  });

  it('routes plain tweens to the configured default adapter', () => {
    const gsapAnimate = vi.spyOn(gsapAdapter, 'animate').mockReturnValue(createNoopControls());
    const motionAnimate = vi.spyOn(motionAdapter, 'animate').mockReturnValue(createNoopControls());
    configure({ defaultAdapter: 'gsap' });

    animate({ x: 0 }, { x: 100 }, { duration: 0.2 });

    expect(gsapAnimate).toHaveBeenCalledTimes(1);
    expect(motionAnimate).not.toHaveBeenCalled();
  });

  it('routes timelines to the configured default adapter', () => {
    configure({ defaultAdapter: 'gsap' });

    expect(resolveAdapter({ timeline: true })).toBe(gsapAdapter);
  });

  it('keeps capability routing when the default adapter lacks the capability', () => {
    configure({ defaultAdapter: 'gsap' });

    expect(resolveAdapter({ spring: {} })).toBe(motionAdapter);
    expect(resolveAdapter({ gesture: true })).toBe(motionAdapter);
  });

  it('lets an explicit per-call engine override the default adapter', () => {
    configure({ defaultAdapter: 'gsap' });

    expect(resolveAdapter({ engine: 'anime' })).toBe(animeAdapter);
  });

  it('ignores an unregistered default adapter', () => {
    configure({ defaultAdapter: 'missing' });

    expect(resolveAdapter()).toBe(motionAdapter);
  });

  it('uses capability routing when no default adapter is configured', () => {
    expect(resolveAdapter()).toBe(motionAdapter);
    expect(resolveAdapter({ timeline: true })).toBe(animeAdapter);
  });
});
