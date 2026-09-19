import type { MorphTargets, TimelineOptions, MorphTimeline, TimelineSegment } from '../types';
import { resolveAdapter } from '../router';
import { stateManager } from '../state';
import { animationEvents } from '../events';

/**
 * Create an animation timeline.
 *
 * @example
 * const tl = timeline({ defaults: { duration: 0.6 } })
 *   .add('.header', { y: ['-100%', '0%'] })
 *   .add('.card', { opacity: [0, 1] }, '+=0.2')
 *   .add('.footer', { y: ['100%', '0%'] }, '-=0.3');
 */
export function timeline(options?: TimelineOptions): MorphTimeline {
  const segments: TimelineSegment[] = [];
  let realTimeline: MorphTimeline | null = null;
  const pendingActions: Array<(t: MorphTimeline) => void> = [];

  let finishedResolve: () => void;
  let finishedReject: (reason: any) => void;
  const finished = new Promise<void>((res, rej) => {
    finishedResolve = res;
    finishedReject = rej;
  });

  const initRealTimeline = (rt: MorphTimeline) => {
    realTimeline = rt;
    const id = stateManager.register(rt, 'timeline');
    rt.finished.then(
      () => {
        stateManager.unregister(id);
        finishedResolve();
      },
      (err) => {
        stateManager.unregister(id);
        finishedReject(err);
      }
    );

    animationEvents.emit('start', {
      type: 'start',
      target: 'timeline',
      controls: rt,
      timestamp: Date.now(),
    });

    while (pendingActions.length > 0) {
      const action = pendingActions.shift()!;
      action(rt);
    }
  };

  /** Lazily build the real timeline from collected segments */
  const buildRealTimeline = (): MorphTimeline | null => {
    if (realTimeline) return realTimeline;

    // Timeline capability routes to AnimeAdapter or GsapAdapter
    const adapter = resolveAdapter({
      timeline: true,
      adapter: options?.adapter,
      engine: (options as any)?.engine,
    });

    if (!adapter.timeline) {
      throw new Error('[MorphJS] Resolved adapter does not support timelines.');
    }

    try {
      const rt = adapter.timeline(segments, options);
      initRealTimeline(rt);
      return rt;
    } catch {
      if (adapter.ensure) {
        adapter.ensure().then(() => {
          if (!realTimeline && adapter.timeline) {
            const rt = adapter.timeline(segments, options);
            initRealTimeline(rt);
          }
        });
      }
      return null;
    }
  };

  const tl: MorphTimeline = {
    // --- Builder methods (lazy — collect segments before build) ---

    add(targets: MorphTargets, properties: Record<string, any>, offset?: number | string) {
      if (realTimeline) {
        realTimeline.add(targets, properties, offset);
      } else {
        segments.push({ targets, properties, offset });
      }
      return tl;
    },

    label(name: string, offset?: number | string) {
      if (realTimeline) {
        realTimeline.label(name, offset);
      } else {
        // Labels are stored as special segments
        segments.push({ targets: '' as any, properties: { __label: name }, offset });
      }
      return tl;
    },

    addPause(offset?: number | string, callback?: () => void) {
      if (realTimeline) {
        realTimeline.addPause(offset, callback);
      } else {
        segments.push({ targets: '' as any, properties: { __pause: true, __callback: callback }, offset });
      }
      return tl;
    },

    // --- Playback controls ---

    play() {
      const rt = buildRealTimeline();
      if (rt) rt.play();
      else pendingActions.push((t) => t.play());
    },

    pause() {
      if (realTimeline) realTimeline.pause();
      else pendingActions.push((t) => t.pause());
    },

    reverse() {
      const rt = buildRealTimeline();
      if (rt) rt.reverse();
      else pendingActions.push((t) => t.reverse());
    },

    cancel() {
      if (realTimeline) realTimeline.cancel();
      else pendingActions.push((t) => t.cancel());
    },

    finish() {
      if (realTimeline) realTimeline.finish();
      else pendingActions.push((t) => t.finish());
    },

    restart() {
      const rt = buildRealTimeline();
      if (rt) rt.restart();
      else pendingActions.push((t) => t.restart());
    },

    seek(time: number) {
      const rt = buildRealTimeline();
      if (rt && rt.seek) rt.seek(time);
      else pendingActions.push((t) => t.seek?.(time));
    },

    commitStyles() {
      if (realTimeline) realTimeline.commitStyles();
    },

    // --- Read-only state ---

    get progress() {
      return realTimeline ? realTimeline.progress : 0;
    },

    get currentTime() {
      return realTimeline ? realTimeline.currentTime : 0;
    },

    get playState() {
      return realTimeline ? realTimeline.playState : ('idle' as const);
    },

    get duration() {
      if (!realTimeline && segments.length > 0) {
        buildRealTimeline();
      }
      return realTimeline ? realTimeline.duration : 0;
    },

    finished,

    then(onFulfilled, onRejected) {
      return finished.then(onFulfilled, onRejected);
    },
  };

  // Auto-play unless explicitly disabled — deferred by one microtask
  // so the builder pattern can collect segments synchronously first
  if (options?.autoplay !== false) {
    Promise.resolve().then(() => {
      tl.play();
    });
  }

  return tl;
}

