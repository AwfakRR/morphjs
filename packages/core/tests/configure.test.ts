import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { animate, configure } from '../src/index';
import { adapterRegistry } from '../src/adapters/adapter';
import { createNoopControls } from '../src/utils/controls';
import { toAnimeEasing } from '../src/easing/easing';
import type { IAnimationAdapter, MorphAnimationOptions } from '../src/types';

const calls: Array<MorphAnimationOptions | undefined> = [];
const recordingAdapter: IAnimationAdapter = {
  name: 'recording',
  capabilities: ['tween'],
  animate: (_targets, _properties, options) => {
    calls.push(options);
    return createNoopControls();
  },
};

describe('configure() animation defaults', () => {
  beforeAll(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    vi.stubGlobal('Element', class {});
    vi.stubGlobal('NodeList', class {});
    adapterRegistry.register({ name: 'recording', adapter: recordingAdapter, capabilities: ['tween'], priority: Infinity });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    calls.length = 0;
    configure({ defaultDuration: 0.3, defaultEase: 'easeOut' });
  });

  it('passes the configured duration and ease to the adapter', () => {
    configure({ defaultDuration: 1.25, defaultEase: 'easeInOut' });
    animate({}, { x: 100 }, { engine: 'recording' });

    expect(calls[0]).toMatchObject({ duration: 1.25, ease: 'easeInOut' });
  });

  it('lets per-call duration and ease override the configured defaults', () => {
    configure({ defaultDuration: 1.25, defaultEase: 'easeInOut' });
    animate({}, { x: 100 }, { engine: 'recording', duration: 0.5, ease: 'linear' });

    expect(calls[0]).toMatchObject({ duration: 0.5, ease: 'linear' });
  });

  it('keeps the configured ease with the numeric duration shorthand', () => {
    configure({ defaultEase: 'easeIn' });
    animate({}, { x: 100 }, 0.75);

    expect(calls[0]).toMatchObject({ duration: 0.75, ease: 'easeIn' });
  });
});

describe('toAnimeEasing', () => {
  it('maps MorphJS ease names to Anime.js v4 names', () => {
    expect(toAnimeEasing('easeOut')).toBe('out');
    expect(toAnimeEasing('easeInOut')).toBe('inOut');
    expect(toAnimeEasing('easeOutQuad')).toBe('outQuad');
  });

  it('passes Anime.js-native names through', () => {
    expect(toAnimeEasing('linear')).toBe('linear');
    expect(toAnimeEasing('out(3)')).toBe('out(3)');
  });
});
