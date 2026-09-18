import type { MorphStaggerOptions } from '../types';
import { resolveAdapter } from '../router';

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
    const adapter = resolveAdapter({ stagger: options });
    if (adapter.stagger) {
      return adapter.stagger(value, options);
    }
  } catch {
    // Adapter not available, fall back
  }

  // Fallback: simple linear stagger
  return (index: number): number => index * value;
}

