// ponytail: shortest API (numeric duration, boolean spring) and compact queue runner
import type { MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphControls } from '../types';
import { resolveAdapter, shouldReduceMotion } from '../router';
import { resolveTargets } from '../utils/targets';
import { stateManager } from '../state';
import { animationEvents } from '../events';
import { createDeferredControls } from '../utils/deferred-controls';

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

  let animControls: MorphControls;

  try {
    if (springOpts && adapter.spring) {
      animControls = adapter.spring(animTargets, properties, springOpts, opts);
    } else {
      animControls = adapter.animate(animTargets, properties, opts);
    }
  } catch {
    const { controls, resolve } = createDeferredControls();

    const loadAndAnimate = async () => {
      try {
        if (adapter.ensure) {
          await adapter.ensure();
        }
        if (springOpts && adapter.spring) {
          resolve(adapter.spring(animTargets, properties, springOpts, opts));
        } else {
          resolve(adapter.animate(animTargets, properties, opts));
        }
      } catch (err) {
        console.error('[MorphJS] Deferred animation failed:', err);
      }
    };
    loadAndAnimate();

    return controls;
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
  });

  return animControls;
}
