// ponytail: shortest API (numeric duration, boolean spring) and compact queue runner
import type { MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphControls, MorphSvgOptions } from '../types';
import { getConfig, resolveAdapter, shouldReduceMotion } from '../router';
import { resolveTargets } from '../utils/targets';
import { createNoopControls } from '../utils/controls';
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
  options: MorphSvgOptions = {}
): MorphControls {
  return runAnimation(targets, properties, options, true);
}

function runAnimation(
  targets: MorphTargets,
  properties: Record<string, any>,
  options: AnimateArg,
  useSvg = false
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

  const startAnimation = (animationOptions: AnimateOptions) => {
    if (useSvg && adapter.svg) {
      return adapter.svg(animTargets, properties, animationOptions);
    }
    if (springOpts && adapter.spring && !reduceMotion) {
      return adapter.spring(animTargets, properties, springOpts, animationOptions);
    }
    return adapter.animate(animTargets, properties, animationOptions);
  };

  const pendingDelay = prepareStagger(opts.delay, animTargets);
  const loadAndAnimate = async ({ resolve, reject }: ReturnType<typeof createDeferredControls>) => {
    let animationOptions = opts;
    try {
      if (pendingDelay) animationOptions = { ...opts, delay: await pendingDelay };
      await adapter.ensure?.();
      resolve(startAnimation(animationOptions));
    } catch (err) {
      if (defaultSvg) {
        try {
          const fallback = resolveAdapter();
          if (fallback !== adapter) {
            await fallback.ensure?.();
            resolve(fallback.animate(animTargets, properties, animationOptions));
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
      animControls = startAnimation(opts);
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
