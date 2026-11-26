import type {
  CubicBezier,
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
import { notifyControlsCanceled } from '../utils/controls';
import { animeTimelineStagger } from '../api/stagger';

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
  const controls: MorphControls = {
    play: () => animeAnimation.play(),
    pause: () => animeAnimation.pause(),
    cancel: () => {
      animeAnimation.pause();
      if (typeof animeAnimation.seek === 'function') animeAnimation.seek(0);
      notifyControlsCanceled(controls);
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
  return controls;
}

/**
 * Convert MorphAnimationOptions (seconds) to Anime.js v4 options (milliseconds).
 */
function toAnimeOptions(
  properties: Record<string, any>,
  options?: MorphAnimationOptions,
  usePropertyTiming = false
): Record<string, any> {
  const result: Record<string, any> = { ...properties };
  const ease = options?.ease ?? (Array.isArray(properties.ease) ? properties.ease as CubicBezier : undefined);

  const duration = options?.duration ?? (usePropertyTiming ? properties.duration : undefined);
  if (typeof duration === 'number') result.duration = duration * 1000;
  const delay = options?.delay ?? (usePropertyTiming ? properties.delay : undefined);
  if (typeof delay === 'function' && options?.delay !== undefined) {
    result.delay = (_target: unknown, index: number, targets: unknown[] | number) =>
      delay(index, typeof targets === 'number' ? targets : targets.length) * 1000;
  } else if (typeof delay === 'number') {
    result.delay = delay * 1000;
  }
  if (ease !== undefined) result.ease = toAnimeEasing(ease);
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

    const { duration, delay, ease } = options?.defaults ?? {};
    const staggerDelay = animeTimelineStagger(delay);
    const defaults = toAnimeOptions({}, { duration, delay: staggerDelay ? undefined : delay, ease });
    if (staggerDelay) defaults.delay = staggerDelay;

    const pauses: Array<{ position: number; callback?: () => void }> = [];
    // Compare checkpoints at the same precision as Anime's playhead getters.
    const roundPosition = (position: number): number => anime.utils.round(position, anime.engine.precision);
    let previousPosition = 0;
    let startPending = true;
    const tl = anime.createTimeline({
      autoplay: options?.autoplay ?? true,
      defaults,
      onBeforeUpdate() {
        if (pauses.length === 0 || tl.paused) return;
        const atEnd = tl.progress === 1;
        const framePosition = atEnd ? (tl.reversed ? 0 : tl.iterationDuration) : tl.iterationCurrentTime;
        const position = roundPosition(framePosition);
        if (position === previousPosition) return;

        const forward = position > previousPosition;
        let marker: (typeof pauses)[number] | undefined;
        let checkpoint = position;
        for (const pause of pauses) {
          const at = roundPosition(pause.position);
          const atStart = startPending && previousPosition === 0 && at === 0;
          const crossed = forward
            ? (previousPosition < at || atStart) && at <= position
            : position <= at && at < previousPosition;
          if (crossed && (!marker || (forward ? at < checkpoint : at > checkpoint))) {
            marker = pause;
            checkpoint = at;
          }
        }
        startPending = false;
        if (!marker) {
          previousPosition = position;
          return;
        }

        // Rewind the unrendered tick, then render to the marker with tween callbacks enabled.
        const callbacks = pauses.filter((pause) => roundPosition(pause.position) === checkpoint);
        const time = atEnd ? tl.duration : tl.currentTime;
        const direction = forward ? 1 : -1;
        tl.pause().seek(time + direction * (previousPosition - framePosition), true);
        previousPosition = checkpoint;
        tl.seek(time + direction * (marker.position - framePosition));
        // Re-arm instant tweens at the opening checkpoint after Anime's tick finishes.
        if (forward && marker.position === 0) {
          queueMicrotask(() => {
            if (tl.paused && tl.currentTime === 0) tl.reset(true);
          });
        }
        for (const { callback } of callbacks) {
          if (callback) queueMicrotask(callback);
        }
      },
    });

    // Add segments
    for (const seg of segments) {
      const segOpts = toAnimeOptions(seg.properties, seg.options, true);
      tl.add(seg.targets, segOpts, toAnimePosition(seg.offset));
    }

    const controls = wrapAnimeControls(tl);
    const syncPlayhead = <Args extends unknown[]>(action: (...args: Args) => void, resetStart = false) =>
      (...args: Args) => {
        action(...args);
        previousPosition = roundPosition(tl.iterationCurrentTime);
        if (resetStart) startPending = previousPosition === 0;
      };

    // Extend with timeline-specific methods
    return {
      ...controls,
      play: syncPlayhead(controls.play),
      seek: syncPlayhead(controls.seek!, true),
      cancel: syncPlayhead(controls.cancel, true),
      finish: syncPlayhead(controls.finish),
      restart: syncPlayhead(controls.restart, true),
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
        const addOpts = toAnimeOptions(addProps, undefined, true);
        tl.add(addTargets, addOpts, toAnimePosition(offset));
        previousPosition = roundPosition(tl.iterationCurrentTime);
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
        previousPosition = roundPosition(tl.iterationCurrentTime);
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
