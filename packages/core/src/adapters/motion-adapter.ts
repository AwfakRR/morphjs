import type { IAnimationAdapter, MorphAnimationOptions, MorphControls, MorphSpringOptions, MorphScrollOptions, MorphGestureOptions, MorphTargets } from '../types';
import { toMotionEasing } from '../easing/easing';
import { notifyControlsCanceled } from '../utils/controls';
import { resolveTargets } from '../utils/targets';

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

export function wrapMotionControls(motionAnimation: any, finished?: PromiseLike<void>): MorphControls {
  const controls: MorphControls = {
    play: () => motionAnimation.play(),
    pause: () => motionAnimation.pause(),
    cancel: () => {
      motionAnimation.cancel();
      notifyControlsCanceled(controls);
    },
    finish: () => motionAnimation.finish(),
    reverse: () => motionAnimation.reverse(),
    seek: (time: number) => {
      if (typeof motionAnimation.seek === 'function') motionAnimation.seek(time);
      else if ('currentTime' in motionAnimation) motionAnimation.currentTime = time;
      else if ('time' in motionAnimation) motionAnimation.time = time;
    },
    get duration() {
      return motionAnimation.duration;
    },
    get progress() {
      return motionAnimation.progress ?? 0;
    },
    get currentTime() {
      return motionAnimation.currentTime ?? 0;
    },
    get finished() {
      return Promise.resolve(finished ?? motionAnimation.finished);
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
      return Promise.resolve(finished ?? motionAnimation.finished).then(onfulfilled, onrejected);
    },
    restart: () => {
      motionAnimation.cancel();
      motionAnimation.play();
    }
  };
  return controls;
}

// Motion writes animated objects during the render phase, so callbacks that read them run after it.
function afterRender(motion: typeof import('motion'), onUpdate?: (value: any) => void) {
  return onUpdate ? (value: any) => motion.frame.postRender(() => onUpdate(value)) : undefined;
}

export const motionAdapter: IAnimationAdapter = {
  name: 'motion',
  capabilities: ['tween', 'spring', 'scroll', 'gesture', 'layout'],
  ensure: ensureMotion,

  animate: (targets: any, keyframes: any, options?: MorphAnimationOptions) => {
    const motion = getMotionSync();
    // Motion settles instant animations before the frame that applies them, so completion waits for that render.
    const instant = options?.duration === 0;
    const motionOptions = options
      ? {
          ...options,
          ease: options.ease !== undefined ? toMotionEasing(options.ease) : undefined,
          onUpdate: afterRender(motion, options.onUpdate),
          onComplete: instant ? undefined : options.onComplete,
        }
      : undefined;
    const animation = motion.animate(targets, keyframes, motionOptions as any);
    if (!instant) return wrapMotionControls(animation);

    const finished = Promise.resolve(animation.finished).then(
      () => new Promise<void>(resolve => motion.frame.postRender(() => resolve()))
    );
    if (options.onComplete) finished.then(options.onComplete);
    return wrapMotionControls(animation, finished);
  },

  spring: (targets: any, keyframes: any, springOptions: MorphSpringOptions, options?: MorphAnimationOptions) => {
    const motion = getMotionSync();
    const transition = {
      ...springOptions,
      type: 'spring' as const,
      onUpdate: afterRender(motion, options?.onUpdate),
    };
    let seq = false, s1: any = {}, s2: any = {};
    for (const [k, v] of Object.entries(keyframes)) {
      if (Array.isArray(v) && v.length > 2) { seq = true; s1[k] = [v[0], v[1]]; s2[k] = v[v.length - 1]; }
      else s1[k] = v;
    }
    if (!seq) return wrapMotionControls(motion.animate(targets, keyframes, transition));

    const c1 = wrapMotionControls(motion.animate(targets, s1, transition));
    let c2: any, cx = false;
    const fin = c1.finished.then(() => cx ? undefined : (c2 = wrapMotionControls(motion.animate(targets, s2, transition)), c2.finished));

    const controls = new Proxy({} as MorphControls, {
      get: (_, p) => {
        if (p === 'finished') return fin;
        if (p === 'then') return fin.then.bind(fin);
        if (p === 'progress') return c2 ? 0.5 + c2.progress * 0.5 : c1.progress * 0.5;
        if (p === 'currentTime' || p === 'playState') return (c2 || c1)[p];
        if (p === 'cancel') return () => {
          cx = true;
          c1.cancel();
          c2?.cancel();
          notifyControlsCanceled(controls);
        };
        if (p === 'restart') return () => { cx = false; c1.cancel(); c2?.cancel(); c1.play(); };
        if (p === 'commitStyles') return () => { c1.commitStyles(); c2?.commitStyles(); };
        return (...a: any[]) => (c2 || c1)[p]?.(...a);
      }
    });
    return controls;
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
    const elements = resolveTargets(targets);
    const cleanups: Array<() => void> = [];

    if (options?.hover && motion.hover) {
      cleanups.push(motion.hover(elements, (_, event) => {
        options.onHoverStart?.(event);
        return endEvent => options.onHoverEnd?.(endEvent);
      }));
    }

    if (options?.press && motion.press) {
      cleanups.push(motion.press(elements, (_, event) => {
        options.onPressStart?.(event);
        return endEvent => options.onPressEnd?.(endEvent);
      }));
    }

    return {
      cleanup: () => cleanups.forEach(fn => fn()),
    };
  },
};
