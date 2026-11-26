import type {
  IAnimationAdapter,
  MorphAnimationOptions,
  MorphControls,
  MorphTimeline,
  MorphStaggerOptions,
  MorphSvgOptions,
  MorphTargets,
  TimelineSegment,
  TimelineOptions,
} from '../types';
import { toAnimeEasing } from '../easing/easing';

/** Cached Anime.js v4 module */
let animeModule: Record<string, any> | null = null;
let animeLoadPromise: Promise<Record<string, any>> | null = null;

/** Ensure Anime.js v4 is loaded (async, first call triggers import) */
export async function ensureAnime(): Promise<Record<string, any>> {
  if (animeModule) return animeModule;
  if (!animeLoadPromise) {
    animeLoadPromise = import('animejs').then((m) => {
      animeModule = m;
      return m;
    }).catch(() => {
      throw new Error(
        '[MorphJS] "animejs" package is required for timeline/stagger/svg animations. Install it: pnpm add animejs'
      );
    });
  }
  return animeLoadPromise;
}

/** Synchronous access — throws if not yet loaded */
export function getAnimeSync(): Record<string, any> {
  if (!animeModule) {
    throw new Error(
      '[MorphJS] Anime adapter not initialized. Call await ensureAnime() first.'
    );
  }
  return animeModule;
}

/**
 * Wrap an Anime.js v4 animation instance into MorphControls.
 * Anime.js uses milliseconds and 0-100 progress; MorphJS uses seconds and 0-1.
 */
export function wrapAnimeControls(animeAnimation: any): MorphControls {
  return {
    play: () => animeAnimation.play(),
    pause: () => animeAnimation.pause(),
    cancel: () => {
      animeAnimation.pause();
      if (typeof animeAnimation.seek === 'function') animeAnimation.seek(0);
    },
    finish: () => {
      if (typeof animeAnimation.seek === 'function') {
        animeAnimation.seek(animeAnimation.duration);
      }
    },
    reverse: () => animeAnimation.reverse(),
    restart: () => animeAnimation.restart(),
    seek: (time: number) => {
      if (typeof animeAnimation.seek === 'function') {
        animeAnimation.seek(time * 1000);
      }
    },
    get progress() {
      return animeAnimation.progress ?? 0;
    },
    get currentTime() {
      return (animeAnimation.currentTime || 0) / 1000; // ms → seconds
    },
    get finished() {
      return Promise.resolve(animeAnimation);
    },
    get playState() {
      if (animeAnimation.completed) return 'finished' as const;
      if (animeAnimation.paused) return 'paused' as const;
      return 'running' as const;
    },
    commitStyles: () => {
      /* Anime.js commits styles inline by default */
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve(animeAnimation).then(onfulfilled, onrejected);
    },
  };
}

/**
 * Convert MorphAnimationOptions (seconds) to Anime.js v4 options (milliseconds).
 */
function toAnimeOptions(
  properties: Record<string, any>,
  options?: MorphAnimationOptions
): Record<string, any> {
  const result: Record<string, any> = { ...properties };

  if (options?.duration !== undefined) result.duration = options.duration * 1000;
  const delay = options?.delay;
  if (typeof delay === 'function') {
    result.delay = (_target: unknown, index: number, targets: unknown[] | number) =>
      delay(index, typeof targets === 'number' ? targets : targets.length) * 1000;
  } else if (delay !== undefined) {
    result.delay = delay * 1000;
  }
  if (options?.ease !== undefined) result.ease = toAnimeEasing(options.ease);
  if (options?.repeat !== undefined) result.loop = options.repeat;
  if (options?.direction !== undefined) result.direction = options.direction;
  if (options?.autoplay !== undefined) result.autoplay = options.autoplay;
  if (options?.onStart) result.onBegin = options.onStart;
  if (options?.onUpdate) {
    result.onUpdate = (anim: any) => options.onUpdate!(anim.progress ?? 0);
  }
  if (options?.onComplete) result.onComplete = options.onComplete;

  return result;
}

function toAnimePosition(offset?: string | number): string | number | undefined {
  if (typeof offset === 'number') return offset * 1000;
  return offset?.replace(/([+-]=)([^=]+)$/, (position, operator, value) => {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? `${operator}${seconds * 1000}` : position;
  });
}

/**
 * Anime.js v4 adapter — handles timelines, staggering, SVG, and basic tweens.
 */
export const animeAdapter: IAnimationAdapter = {
  name: 'anime',
  capabilities: ['tween', 'timeline', 'stagger', 'svg'],
  ensure: ensureAnime,

  animate(
    targets: MorphTargets,
    properties: Record<string, any>,
    options?: MorphAnimationOptions
  ): MorphControls {
    const anime = getAnimeSync();
    const animeOpts = toAnimeOptions(properties, options);
    // Anime.js v4: named export `animate(targets, parameters)`
    const animation = anime.animate(targets, animeOpts);
    return wrapAnimeControls(animation);
  },

  timeline(
    segments: TimelineSegment[],
    options?: TimelineOptions
  ): MorphTimeline {
    const anime = getAnimeSync();

    // Build timeline defaults
    const defaults: Record<string, any> = {};
    if (options?.defaults?.duration !== undefined) {
      defaults.duration = options.defaults.duration * 1000;
    }
    if (options?.defaults?.ease !== undefined) {
      defaults.ease = toAnimeEasing(options.defaults.ease);
    }

    const pauses: Array<{ position: number; callback?: () => void }> = [];
    let previousPosition = 0;
    const tl = anime.createTimeline({
      autoplay: options?.autoplay ?? true,
      defaults,
      onBeforeUpdate() {
        if (pauses.length === 0 || tl.paused) return;
        const position = tl.iterationCurrentTime;
        if (position === previousPosition) return;

        const forward = position > previousPosition;
        let marker: (typeof pauses)[number] | undefined;
        for (const pause of pauses) {
          const at = pause.position;
          const crossed = forward ? previousPosition < at && at <= position : position <= at && at < previousPosition;
          if (crossed && (!marker || (forward ? at < marker.position : at > marker.position))) marker = pause;
        }
        if (!marker) {
          previousPosition = position;
          return;
        }

        // Rewind the unrendered tick, then render to the marker with tween callbacks enabled.
        const time = tl.currentTime;
        tl.pause().seek(time - Math.abs(position - previousPosition), true);
        previousPosition = marker.position;
        tl.seek(time - Math.abs(position - marker.position));
        if (marker.callback) queueMicrotask(marker.callback);
      },
    });

    // Add segments
    for (const seg of segments) {
      const segOpts = toAnimeOptions(seg.properties, seg.options);
      tl.add(seg.targets, segOpts, toAnimePosition(seg.offset));
    }

    const controls = wrapAnimeControls(tl);
    const syncPlayhead = <Args extends unknown[]>(action: (...args: Args) => void) =>
      (...args: Args) => {
        action(...args);
        previousPosition = tl.iterationCurrentTime;
      };

    // Extend with timeline-specific methods
    return {
      ...controls,
      play: syncPlayhead(controls.play),
      seek: syncPlayhead(controls.seek!),
      cancel: syncPlayhead(controls.cancel),
      finish: syncPlayhead(controls.finish),
      restart: syncPlayhead(controls.restart),
      reverse: syncPlayhead(controls.reverse),
      get duration() {
        return (tl.duration || 0) / 1000;
      },
      get progress() {
        return controls.progress;
      },
      get currentTime() {
        return controls.currentTime;
      },
      get playState() {
        return controls.playState;
      },
      add(addTargets, addProps, offset?) {
        const addOpts = toAnimeOptions(addProps);
        tl.add(addTargets, addOpts, toAnimePosition(offset));
        previousPosition = tl.iterationCurrentTime;
        return this;
      },
      label(name, offset?) {
        tl.label(name, toAnimePosition(offset));
        return this;
      },
      addPause(offset?, callback?) {
        // Let Anime resolve the position and account for it in the duration.
        let key = '__morph_pause';
        while (key in tl.labels) key += '_';
        tl.label(key, toAnimePosition(offset));
        const position = tl.labels[key];
        delete tl.labels[key];
        pauses.push({ position, callback });

        const time = tl.currentTime;
        const wasPaused = tl.paused;
        // Anime reinitializes the playhead when adding a child.
        tl.pause().add({ duration: 0, delay: 0 }, position).pause().seek(time, true);
        previousPosition = tl.iterationCurrentTime;
        if (!wasPaused) tl.resume();
        return this;
      },
    };
  },

  stagger(value: number, options?: MorphStaggerOptions): any {
    const anime = getAnimeSync();
    // Anime.js stagger values are in ms; morph uses seconds
    return anime.stagger(value * 1000, options as any);
  },

  svg(
    targets: MorphTargets,
    properties: Record<string, any>,
    options?: MorphSvgOptions
  ): MorphControls {
    const anime = getAnimeSync();
    const animeOpts = toAnimeOptions(properties, options);
    const animation = anime.animate(targets, animeOpts);
    return wrapAnimeControls(animation);
  },
};
