import { describe, it, expect } from 'vitest';
import morph, { timeline, spring, stagger, scroll, gesture, svg, flip } from '../src/index';

describe('MorphJS Core API', () => {
  it('should be callable directly with duration shorthand', () => {
    const el = { style: {} };
    const controls = morph(el as any, { opacity: 1 }, 0.5);
    expect(controls).toBeDefined();
    expect(typeof controls.play).toBe('function');
    expect(typeof controls.pause).toBe('function');
  });

  it('should resolve animation completion in non-browser environment', async () => {
    const controls = morph({ style: {} } as any, { opacity: 1 }, 0.5);
    await expect(controls.finished).resolves.toBeUndefined();
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
    expect(typeof morph.flip).toBe('function');
    expect(typeof morph.flip.capture).toBe('function');
    expect(typeof morph.flip.from).toBe('function');
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

  it('should return no-op controls for scroll in non-browser environment', () => {
    const controls = scroll(() => {});
    expect(controls).toBeDefined();
    expect(typeof controls.cancel).toBe('function');
  });

  it('should return no-op cleanup for gesture in non-browser environment', () => {
    const cleanup = gesture({} as any, { hover: true });
    expect(typeof cleanup).toBe('function');
  });

  it('should return no-op controls for svg in non-browser environment', () => {
    const controls = svg.draw({} as any);
    expect(controls).toBeDefined();
    expect(typeof controls.play).toBe('function');
  });

  it('should return empty state and no-op controls for flip in non-browser environment', async () => {
    const state = flip.capture('.card');
    expect(state.snapshots.size).toBe(0);
    const controls = flip.from(state, 0.3);
    expect(controls).toBeDefined();
    await expect(controls.finished).resolves.toBeUndefined();

    const mutate = () => {
      throw new Error('mutate should not run during SSR');
    };
    const oneStep = flip('.card', mutate, 0.3);
    expect(oneStep).toBeDefined();
    await expect(oneStep.finished).resolves.toBeUndefined();
  });
});
