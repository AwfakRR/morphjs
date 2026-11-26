import type { MorphAnimationOptions, MorphStaggerOptions, MorphTargets } from '../types';
import { animeAdapter } from '../adapters/anime-adapter';
import { adapterRegistry } from '../adapters/adapter';

type Delay = (index: number, total: number) => number;
type AnimeDelay = (target: unknown, index: number, targets: unknown[]) => number;
const advanced = new WeakMap<Function, {
  prepare: (targets: MorphTargets) => Promise<Delay>;
  create: () => AnimeDelay;
}>();

export function prepareStagger(delay: MorphAnimationOptions['delay'], targets: MorphTargets) {
  if (typeof delay === 'function') return advanced.get(delay)?.prepare(targets);
}

export function animeTimelineStagger(delay: MorphAnimationOptions['delay']): AnimeDelay | undefined {
  const stagger = typeof delay === 'function' ? advanced.get(delay) : undefined;
  if (!stagger) return;
  const byTargets = new WeakMap<unknown[], AnimeDelay>();
  return (target, index, targets) => {
    let compute = byTargets.get(targets);
    if (!compute) {
      compute = stagger.create();
      byTargets.set(targets, compute);
    }
    return compute(target, index, targets);
  };
}

/**
 * Create a stagger function for use in animation delays/offsets.
 *
 * @example
 * // Basic stagger — 100ms between each element
 * animate('.item', { opacity: [0, 1] }, { delay: stagger(0.1) });
 *
 * @example
 * // Advanced stagger — grid pattern from center
 * animate('.grid-item', { scale: [0, 1] }, {
 *   delay: stagger(0.05, { from: 'center', grid: [10, 10] })
 * });
 */
export function stagger(value: number, options?: MorphStaggerOptions): any {
  const isAdvanced = options && (options.grid || options.jitter !== undefined);

  // For basic stagger: implement natively without needing an adapter
  if (!isAdvanced) {
    return (index: number, total: number): number => {
      let effectiveIndex = index;

      if (options?.from === 'last') {
        effectiveIndex = total - 1 - index;
      } else if (options?.from === 'center') {
        const center = (total - 1) / 2;
        effectiveIndex = Math.abs(index - center);
      } else if (options?.from === 'random') {
        effectiveIndex = Math.random() * total;
      } else if (typeof options?.from === 'number') {
        effectiveIndex = Math.abs(index - options.from);
      }

      const start = typeof options?.start === 'number' ? options.start : 0;
      return start + effectiveIndex * value;
    };
  }

  // For advanced stagger (grid/jitter/seed): delegate to AnimeAdapter
  try {
    // Delays are engine-neutral numbers, so compute them with the stagger engine
    // regardless of the default animation adapter.
    const adapter = adapterRegistry.findByCapability('stagger');
    if (adapter === animeAdapter) {
      const create = () => adapter.stagger!(value, options);
      let direct: ReturnType<NonNullable<typeof adapter.stagger>>;
      const delay = (...args: unknown[]) => (direct ??= create())(...args);
      advanced.set(delay, {
        create,
        async prepare(targets) {
          try {
            await adapter.ensure?.();
          } catch {
            return index => index * value;
          }
          const compute = create();
          const list = Array.isArray(targets) ? targets.flat() : [targets];
          return index => Number(compute(list[index], index, list)) / 1000;
        },
      });
      return delay;
    }
    if (adapter?.stagger) {
      return adapter.stagger(value, options);
    }
  } catch {
    // Adapter not available, fall back
  }

  // Fallback: simple linear stagger
  return (index: number): number => index * value;
}
