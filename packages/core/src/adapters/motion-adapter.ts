import type { IAnimationAdapter, MorphAnimationOptions, MorphControls, MorphSpringOptions, MorphScrollOptions, MorphGestureOptions, MorphTargets } from '../types';
import { toMotionEasing } from '../easing/easing';

let motionModule: typeof import('motion') | null = null;
let motionLoadPromise: Promise<typeof import('motion')> | null = null;

export async function ensureMotion(): Promise<typeof import('motion')> {
  if (motionModule) return motionModule;
  if (!motionLoadPromise) {
    motionLoadPromise = import('motion').then(m => {
      motionModule = m;
      return m;
    }).catch(() => {
      throw new Error('[MorphJS] "motion" package is required for spring/scroll/gesture animations. Install it: pnpm add motion');
    });
  }
  return motionLoadPromise;
}

export function getMotionSync(): typeof import('motion') {
  if (!motionModule) {
    throw new Error('[MorphJS] Motion adapter not initialized. Call await ensureMotion() first, or use the async API.');
  }
  return motionModule;
}

export function wrapMotionControls(motionAnimation: any): MorphControls {
  return {
    play: () => motionAnimation.play(),
    pause: () => motionAnimation.pause(),
    cancel: () => motionAnimation.cancel(),
    finish: () => motionAnimation.finish(),
    reverse: () => motionAnimation.reverse(),
    seek: (time: number) => {
      if (typeof motionAnimation.seek === 'function') motionAnimation.seek(time);
      else if ('currentTime' in motionAnimation) motionAnimation.currentTime = time;
    },
    get progress() {
      return motionAnimation.progress ?? 0;
    },
    get currentTime() {
      return motionAnimation.currentTime ?? 0;
    },
    get finished() {
      return Promise.resolve(motionAnimation.finished);
    },
    get playState() {
      return motionAnimation.playState;
    },
    commitStyles: () => {
      if (typeof motionAnimation.commitStyles === 'function') {
        motionAnimation.commitStyles();
      }
    },
    then: (onfulfilled, onrejected) => {
      return Promise.resolve(motionAnimation.finished).then(onfulfilled, onrejected);
    },
    restart: () => {
      motionAnimation.cancel();
      motionAnimation.play();
    }
  };
}

if (typeof window !== 'undefined') {
  ensureMotion().catch(() => {});
}

export const motionAdapter: IAnimationAdapter = {
  name: 'motion',
  capabilities: ['tween', 'spring', 'scroll', 'gesture', 'layout'],
  ensure: ensureMotion,

  animate: (targets: any, keyframes: any, options?: MorphAnimationOptions) => {
    const motion = getMotionSync();
    const motionOptions = options
      ? {
          ...options,
          ease: options.ease !== undefined ? toMotionEasing(options.ease) : undefined,
        }
      : undefined;
    const animation = motion.animate(targets, keyframes, motionOptions as any);
    return wrapMotionControls(animation);
  },

  spring: (targets: any, keyframes: any, options?: MorphSpringOptions) => {
    const motion = getMotionSync();

    // Support multi-keyframe arrays in springs (e.g. [0, -70, 0] or [1, 1.2, 1])
    let hasSequence = false;
    const step1: Record<string, any> = {};
    const step2: Record<string, any> = {};

    for (const [k, v] of Object.entries(keyframes)) {
      if (Array.isArray(v) && v.length > 2) {
        hasSequence = true;
        step1[k] = v[1]; // peak target
        step2[k] = v[v.length - 1]; // return target
      } else {
        step1[k] = v;
      }
    }

    if (hasSequence) {
      const controls1 = wrapMotionControls(motion.animate(targets, step1, { ...options, type: 'spring' } as any));
      let controls2: MorphControls | null = null;
      let isCancelled = false;

      const finished = controls1.finished.then(() => {
        if (isCancelled) return;
        controls2 = wrapMotionControls(motion.animate(targets, step2, { ...options, type: 'spring' } as any));
        return controls2.finished;
      });

      return {
        play: () => (controls2 || controls1).play(),
        pause: () => (controls2 || controls1).pause(),
        cancel: () => {
          isCancelled = true;
          controls1.cancel();
          if (controls2) controls2.cancel();
        },
        finish: () => {
          if (controls2) controls2.finish();
          else controls1.finish();
        },
        reverse: () => (controls2 || controls1).reverse(),
        restart: () => {
          isCancelled = false;
          controls1.cancel();
          if (controls2) controls2.cancel();
          controls1.play();
        },
        seek: (time: number) => {
          if (controls2?.seek) controls2.seek(time);
          else if (controls1?.seek) controls1.seek(time);
        },
        get progress() {
          return controls2 ? 0.5 + controls2.progress * 0.5 : controls1.progress * 0.5;
        },
        get currentTime() {
          return controls2 ? controls2.currentTime : controls1.currentTime;
        },
        get finished() {
          return finished;
        },
        get playState() {
          return controls2 ? controls2.playState : controls1.playState;
        },
        commitStyles: () => {
          controls1.commitStyles();
          controls2?.commitStyles();
        },
        then: (onfulfilled, onrejected) => finished.then(onfulfilled, onrejected),
      };
    }

    const animation = motion.animate(targets, keyframes, {
      ...options,
      type: 'spring'
    } as any);
    return wrapMotionControls(animation);
  },

  scroll(animationOrCallback: MorphControls | ((progress: number) => void), options?: MorphScrollOptions): MorphControls {
    const motion = getMotionSync();
    const res = (motion as any).scroll(animationOrCallback, options);
    if (typeof animationOrCallback === 'function') {
      return {
        play: () => {},
        pause: () => {},
        reverse: () => {},
        cancel: () => {
          if (typeof res === 'function') res();
        },
        finish: () => {},
        restart: () => {},
        progress: 0,
        currentTime: 0,
        playState: 'running',
        finished: Promise.resolve(),
        then: (onfulfilled) => Promise.resolve().then(onfulfilled),
        commitStyles: () => {},
      };
    }
    return animationOrCallback;
  },

  gesture(targets: MorphTargets, options?: MorphGestureOptions): { cleanup: () => void } {
    const motion = getMotionSync();
    const cleanups: Array<() => void> = [];

    if (options?.hover && (motion as any).hover) {
      const cleanup = (motion as any).hover(targets, {
        onHoverStart: options.onHoverStart,
        onHoverEnd: options.onHoverEnd,
      });
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }

    if (options?.press && (motion as any).press) {
      const cleanup = (motion as any).press(targets, {
        onPressStart: options.onPressStart,
        onPressEnd: options.onPressEnd,
      });
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }

    return {
      cleanup: () => cleanups.forEach(fn => fn()),
    };
  },
};
