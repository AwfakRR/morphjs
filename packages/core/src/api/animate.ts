// ponytail: shortest API (numeric duration, boolean spring) and compact queue runner
import type { MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphControls } from '../types';
import { resolveAdapter, shouldReduceMotion } from '../router';
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
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return createNoopControls();
  }

  let opts: AnimateOptions = typeof options === 'number' ? { duration: options } : { ...options };
  const springOpts: MorphSpringOptions | undefined =
    opts.spring === true ? {} : typeof opts.spring === 'object' ? opts.spring : undefined;

  if (shouldReduceMotion()) {
    opts.duration = 0;
  }

  const adapter = resolveAdapter({
    adapter: opts.adapter,
    engine: opts.engine,
    spring: springOpts,
  });

  const elements = resolveTargets(targets);
  const animTargets = elements.length > 0 ? elements : targets;

  const start = (animationOptions: AnimateOptions) =>
    springOpts && adapter.spring
      ? adapter.spring(animTargets, properties, springOpts, animationOptions)
      : adapter.animate(animTargets, properties, animationOptions);
  const pendingDelay = prepareStagger(opts.delay, animTargets);
  let animControls: MorphControls;

  if (pendingDelay) {
    const deferred = createDeferredControls();
    void Promise.all([pendingDelay, adapter.ensure?.()])
      .then(([delay]) => deferred.resolve(start({ ...opts, delay })))
      .catch(deferred.reject);
    animControls = deferred.controls;
  } else {
    try {
      animControls = start(opts);
    } catch {
      const { controls, resolve } = createDeferredControls();
      const loadAndAnimate = async () => {
        try {
          await adapter.ensure?.();
          resolve(start(opts));
        } catch (err) {
          console.error('[MorphJS] Deferred animation failed:', err);
        }
      };
      loadAndAnimate();
      return controls;
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
