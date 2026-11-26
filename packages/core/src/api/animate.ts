// ponytail: shortest API (numeric duration, boolean spring) and compact queue runner
import type { MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphControls, MorphSvgOptions } from '../types';
import { resolveAdapter, shouldReduceMotion } from '../router';
import { resolveTargets } from '../utils/targets';
import { createNoopControls } from '../utils/controls';
import { stateManager } from '../state';
import { animationEvents } from '../events';

export interface AnimateOptions extends MorphAnimationOptions {
  spring?: boolean | MorphSpringOptions;
  adapter?: string;
  engine?: 'motion' | 'anime' | 'gsap' | string;
}

export type AnimateArg = number | AnimateOptions;

function createDeferredControls(): { controls: MorphControls; resolve: (controls: MorphControls) => void } {
  let real: MorphControls | null = null;
  const q: Array<(c: MorphControls) => void> = [];
  let res: () => void, rej: (err: any) => void;
  const finished = new Promise<void>((r, e) => { res = r; rej = e; });
  const run = (fn: (c: MorphControls) => void) => (real ? fn(real) : q.push(fn));

  const controls: MorphControls = {
    play: () => run(c => c.play()),
    pause: () => run(c => c.pause()),
    reverse: () => run(c => c.reverse()),
    cancel: () => run(c => c.cancel()),
    finish: () => run(c => c.finish()),
    restart: () => run(c => c.restart()),
    commitStyles: () => run(c => c.commitStyles()),
    seek: (time: number) => run(c => c.seek?.(time)),
    get progress() { return real?.progress ?? 0; },
    get currentTime() { return real?.currentTime ?? 0; },
    get playState() { return real?.playState ?? 'idle'; },
    finished,
    then: (onF, onR) => finished.then(onF, onR),
  };

  return {
    controls,
    resolve: (c: MorphControls) => {
      real = c;
      c.finished.then(res, rej);
      q.forEach(fn => fn(c));
      q.length = 0;
    },
  };
}

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
  return runAnimation(targets, properties, options);
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

  if (shouldReduceMotion()) {
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

  const startAnimation = () => {
    if (useSvg && adapter.svg) {
      return adapter.svg(animTargets, properties, opts);
    }
    if (springOpts && adapter.spring) {
      return adapter.spring(animTargets, properties, springOpts, opts);
    }
    return adapter.animate(animTargets, properties, opts);
  };

  let animControls: MorphControls;

  try {
    animControls = startAnimation();
  } catch {
    const { controls, resolve } = createDeferredControls();

    const loadAndAnimate = async () => {
      try {
        if (adapter.ensure) {
          await adapter.ensure();
        }
        resolve(startAnimation());
      } catch (err) {
        if (defaultSvg) {
          try {
            const fallback = resolveAdapter();
            if (fallback !== adapter) {
              await fallback.ensure?.();
              resolve(fallback.animate(animTargets, properties, opts));
              return;
            }
          } catch {
            // No usable tween adapter.
          }
        }
        if (useSvg) resolve(createNoopControls());
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
