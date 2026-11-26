import { describe, it, expect } from 'vitest';
import morph, { timeline, spring, stagger, scroll, gesture, svg } from '../src/index';

describe('MorphJS Stripped API', () => {
  it('should be callable directly with duration shorthand', () => {
    const el = { style: {} };
    const controls = morph(el as any, { opacity: 1 }, 0.5);
    expect(controls).toBeDefined();
    expect(typeof controls.play).toBe('function');
    expect(typeof controls.pause).toBe('function');
  });

  it.each([['animate', morph.animate], ['spring', spring]] as const)(
    'should resolve %s completion in node environment',
    async (_, animate) => {
      const controls = animate({ style: {} } as any, { opacity: 1 });
      await expect(controls.finished).resolves.toBeUndefined();
    },
  );

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

  it('should create a stagger function', () => {
    const stag = stagger(0.1, { from: 'center' });
    expect(typeof stag).toBe('function');
    expect(stag(0, 5)).toBe(0.2);
  });

  it('should stagger a 6×6 grid from the four middle cells, not the row ends', () => {
    const delay = stagger(0.04, { from: 'center', grid: [6, 6] });
    const delays = Array.from({ length: 36 }, (_, i) => delay(i, 36));
    const earliest = Math.min(...delays);

    expect(delays.flatMap((delay, i) => delay === earliest ? [i] : [])).toEqual([14, 15, 20, 21]);
    for (const corner of [0, 5, 30, 35]) {
      expect(delays[corner]).toBeCloseTo(0.04 * Math.hypot(2.5, 2.5));
    }
  });

  it('should respect the dimensions and start offset of a rectangular grid', () => {
    const delay = stagger(0.1, { from: 'center', grid: [5, 3], start: 0.2 });

    expect(delay(7, 15)).toBe(0.2);
    expect(delay(2, 15)).toBeCloseTo(0.3);
    expect(delay(5, 15)).toBeCloseTo(0.4);
  });

  it('should return controls for scroll in node environment', () => {
    const controls = scroll(() => {});
    expect(controls).toBeDefined();
    expect(typeof controls.cancel).toBe('function');
  });

  it('should resolve scroll completion in node environment', async () => {
    const controls = scroll(() => {});
    await expect(controls.finished).resolves.toBeUndefined();
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
