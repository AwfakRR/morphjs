// ponytail: shortest API (numeric duration, boolean spring) and compact queue runner
import type { IAnimationAdapter, MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphControls, MorphSvgOptions } from '../types';
import { getConfig, resolveAdapter, shouldReduceMotion } from '../router';
import { resolveTargets } from '../utils/targets';
import { createNoopControls, groupControls } from '../utils/controls';
import { animeAdapter } from '../adapters/anime-adapter';
import { gsapAdapter } from '../adapters/gsap-adapter';
import { motionAdapter } from '../adapters/motion-adapter';
import { stateManager } from '../state';
import { animationEvents } from '../events';
import { createDeferredControls } from '../utils/deferred-controls';
import { prepareStagger } from './stagger';

export interface AnimateOptions extends MorphAnimationOptions {
  spring?: boolean | MorphSpringOptions;
  adapter?: string;
  engine?: 'motion' | 'anime' | 'gsap' | string;
}

export type AnimateArg = number | AnimateOptions;

/**
 * Animate one or more elements.
 *
 * @example
 * // Shortest syntax: numeric duration
 * morph('.box', { x: 100 }, 0.5);
 *
 * @example
 * // Spring shortcut
 * morph('.box', { scale: 1.2 }, { spring: true });
 */
export function animate(
  targets: MorphTargets,
  properties: Record<string, any>,
  options: AnimateArg = {}
): MorphControls {
  const opts = typeof options === 'number' ? { duration: options } : options;
  const { defaultDuration, defaultEase } = getConfig();
  return runAnimation(targets, properties, {
    ...opts,
    duration: opts.duration ?? defaultDuration,
    ease: opts.ease ?? defaultEase,
  });
}

export function animateSvg(
  targets: MorphTargets,
  properties: Record<string, any>,
  options: MorphSvgOptions = {},
  targetProperties?: (index: number) => Record<string, any>
): MorphControls {
  return runAnimation(targets, properties, options, true, targetProperties);
}

function runAnimation(
  targets: MorphTargets,
  properties: Record<string, any>,
  options: AnimateArg,
  useSvg = false,
  targetProperties?: (index: number) => Record<string, any>
): MorphControls {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return createNoopControls();
  }

  const opts: AnimateOptions = typeof options === 'number' ? { duration: options } : { ...options };
  const springOpts: MorphSpringOptions | undefined =
    opts.spring === true ? {} : typeof opts.spring === 'object' ? opts.spring : undefined;
  const reduceMotion = shouldReduceMotion();

  if (reduceMotion) {
    opts.duration = 0;
  }

  const defaultSvg = useSvg && !opts.adapter && !opts.engine;
  const adapter = resolveAdapter({
    adapter: defaultSvg ? 'anime' : opts.adapter,
    engine: opts.engine,
    spring: springOpts,
    svg: useSvg,
  });

  const elements = resolveTargets(targets);
  const animTargets = elements.length > 0 ? elements : targets;

  const startAnimation = (backend: IAnimationAdapter, animationOptions: AnimateOptions, isFallback = false) => {
    const start = (targets: MorphTargets, props: Record<string, any>, options: AnimateOptions) => {
      if (!isFallback && useSvg && backend.svg) return backend.svg(targets, props, options);
      if (!isFallback && springOpts && backend.spring && !reduceMotion) {
        return backend.spring(targets, props, springOpts, options);
      }
      return backend.animate(targets, props, options);
    };

    if (!targetProperties || !elements.length || backend === animeAdapter || backend === gsapAdapter) {
      return start(animTargets, properties, animationOptions);
    }

    const { delay, onStart, onComplete, onCancel, ...shared } = animationOptions;
    const once = (callback?: () => void) => callback && (() => {
      const notify = callback;
      callback = undefined;
      notify?.();
    });
    const startOnce = once(onStart), cancelOnce = once(onCancel);
    const controls = elements.map((element, index) => start([element], targetProperties(index), {
      ...shared, delay: typeof delay === 'function' ? delay(index, elements.length) : delay,
      onStart: startOnce, onCancel: cancelOnce,
    }));
    return groupControls(controls, onComplete, backend === motionAdapter ? control => control.seek?.(0) : undefined);
  };

  const pendingDelay = prepareStagger(opts.delay, animTargets);
  const loadAndAnimate = async ({ resolve, reject }: ReturnType<typeof createDeferredControls>) => {
    let animationOptions = opts;
    try {
      if (pendingDelay) animationOptions = { ...opts, delay: await pendingDelay };
      await adapter.ensure?.();
      resolve(startAnimation(adapter, animationOptions));
    } catch (err) {
      if (defaultSvg) {
        try {
          const fallback = resolveAdapter();
          if (fallback !== adapter) {
            await fallback.ensure?.();
            resolve(startAnimation(fallback, animationOptions, true));
            return;
          }
        } catch {
          // No usable tween adapter.
        }
      }
      if (useSvg) resolve(createNoopControls());
      else if (pendingDelay) reject(err);
      console.error('[MorphJS] Deferred animation failed:', err);
    }
  };

  let animControls: MorphControls;
  if (pendingDelay) {
    const deferred = createDeferredControls();
    void loadAndAnimate(deferred);
    animControls = deferred.controls;
  } else {
    try {
      animControls = startAnimation(adapter, opts);
    } catch {
      const deferred = createDeferredControls();
      void loadAndAnimate(deferred);
      return deferred.controls;
    }
  }

  const id = stateManager.register(animControls, targets);

  animationEvents.emit('start', {
    type: 'start',
    target: targets,
    controls: animControls,
    timestamp: Date.now(),
  });

  animControls.finished.then(() => {
    animationEvents.emit('complete', {
      type: 'complete',
      target: targets,
      controls: animControls,
      timestamp: Date.now(),
    });
    stateManager.unregister(id);
  }, () => stateManager.unregister(id));

  return animControls;
}
