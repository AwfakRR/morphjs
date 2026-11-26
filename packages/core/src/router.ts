import type { MorphAnimationOptions, MorphSpringOptions, MorphStaggerOptions, AdapterCapability, IAnimationAdapter, MorphConfig } from './types';
import { adapterRegistry } from './adapters/adapter';

let globalConfig: MorphConfig = {
  defaultAdapter: undefined,
  defaultDuration: 0.3,
  defaultEase: 'easeOut',
  reducedMotion: 'user',
};

export function configure(config: Partial<MorphConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

export function getConfig(): Readonly<MorphConfig> {
  return globalConfig;
}

function detectRequiredCapability(options: any): AdapterCapability {
  if (options?.spring) return 'spring';
  if (options?.scroll) return 'scroll';
  if (options?.gesture) return 'gesture';
  if (options?.timeline) return 'timeline';
  if (options?.svg) return 'svg';
  if (options?.layout) return 'layout';
  if (options?.stagger && (options.stagger.grid || options.stagger.jitter !== undefined)) return 'stagger';
  return 'tween';
}

/**
 * Resolve which adapter to use based on the animation requirements.
 * Priority:
 * 1. Explicit adapter specified in options
 * 2. Global default adapter, when it supports the required capability
 * 3. Capability-based routing (spring→motion, timeline→anime, etc.)
 * 4. First available adapter with 'tween' capability
 */
export function resolveAdapter(options?: {
  adapter?: string;
  engine?: string;
  spring?: MorphSpringOptions;
  scroll?: boolean;
  gesture?: boolean;
  timeline?: boolean;
  svg?: boolean;
  layout?: boolean;
  stagger?: MorphStaggerOptions;
}): IAnimationAdapter {
  const chosen = options?.engine || options?.adapter;
  if (chosen) {
    const adapter = adapterRegistry.get(chosen);
    if (adapter) return adapter;
    console.warn(`[MorphJS] Adapter/Engine "${chosen}" not found. Falling back.`);
  }

  const requiredCapability = detectRequiredCapability(options);

  if (globalConfig.defaultAdapter) {
    const adapter = adapterRegistry.get(globalConfig.defaultAdapter);
    if (adapter?.capabilities.includes(requiredCapability)) return adapter;
  }

  const capabilityAdapter = adapterRegistry.findByCapability(requiredCapability);
  if (capabilityAdapter) {
    return capabilityAdapter;
  }

  const defaultTweenAdapter = adapterRegistry.findByCapability('tween');
  if (defaultTweenAdapter) {
    return defaultTweenAdapter;
  }

  throw new Error(`[MorphJS] No suitable adapter found for capability "${requiredCapability}".`);
}

export function shouldReduceMotion(): boolean {
  if (globalConfig.reducedMotion === 'always') return true;
  if (globalConfig.reducedMotion === 'never') return false;
  
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mediaQuery.matches;
  }
  return false;
}
