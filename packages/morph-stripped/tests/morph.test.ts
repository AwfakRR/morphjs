import { describe, it, expect, vi } from 'vitest';
import morph, { timeline, spring, stagger, scroll, gesture, svg } from '../src/index';

describe('MorphJS Stripped API', () => {
  it('should be callable directly with duration shorthand', () => {
    const el = { style: {} };
    const controls = morph(el as any, { opacity: 1 }, 0.5);
    expect(controls).toBeDefined();
    expect(typeof controls.play).toBe('function');
    expect(typeof controls.pause).toBe('function');
  });

  it('should expose sub-APIs on morph function', () => {
    expect(typeof morph.animate).toBe('function');
    expect(typeof morph.timeline).toBe('function');
    expect(typeof morph.spring).toBe('function');
    expect(typeof morph.stagger).toBe('function');
    expect(typeof morph.scroll).toBe('function');
    expect(typeof morph.gesture).toBe('function');
    expect(typeof morph.svg).toBe('object');
    expect(typeof morph.svg.draw).toBe('function');
    expect(typeof morph.svg.morph).toBe('function');
  });

  it('should create a timeline with seek and playback methods', () => {
    const tl = timeline({ autoplay: false });
    const el = { style: {} };
    tl.add(el as any, { x: 100 }, 0);
    expect(typeof tl.play).toBe('function');
    expect(typeof tl.pause).toBe('function');
    expect(typeof tl.reverse).toBe('function');
    expect(typeof tl.restart).toBe('function');
    expect(typeof tl.seek).toBe('function');
  });

  it('keeps the timeline playhead on the rendered position when reversing', async () => {
    const target = { x: 0 };
    const tl = timeline({ autoplay: false })
      .add(target as any, { x: [0, 100], duration: 1000, ease: 'linear' }, 0);

    try {
      await vi.waitFor(() => expect(tl.duration).toBe(1));
      tl.seek?.(0.25);
      expect(target.x).toBeCloseTo(25);
      expect(tl.currentTime).toBeCloseTo(0.25);

      tl.reverse();
      expect(target.x).toBeCloseTo(25);
      expect(tl.currentTime).toBeCloseTo(0.25);
      await vi.waitFor(() => expect(tl.currentTime).toBeLessThan(0.2));
      expect(tl.currentTime).toBeCloseTo(target.x / 100);

      tl.pause();
      tl.seek?.(0.4);
      expect(target.x).toBeCloseTo(40);
      expect(tl.currentTime).toBeCloseTo(0.4);
      expect(tl.progress).toBeCloseTo(0.4);
    } finally {
      tl.pause();
    }
  });

  it('should create a stagger function', () => {
    const stag = stagger(0.1, { from: 'center' });
    expect(typeof stag).toBe('function');
    expect(stag(0, 5)).toBe(0.2);
  });

  it('should return controls for scroll in node environment', () => {
    const controls = scroll(() => {});
    expect(controls).toBeDefined();
    expect(typeof controls.cancel).toBe('function');
  });

  it('should return cleanup for gesture in node environment', () => {
    const cleanup = gesture({} as any, { hover: true });
    expect(typeof cleanup).toBe('function');
  });

  it('should return controls for svg in node environment', () => {
    const controls = svg.draw({} as any);
    expect(controls).toBeDefined();
    expect(typeof controls.play).toBe('function');
  });
});
