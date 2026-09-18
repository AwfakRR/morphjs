import type { MorphTargets, MorphSpringOptions, MorphAnimationOptions, MorphControls } from '../types';
import { animate } from './animate';

/**
 * Animate with spring physics. Always uses the Motion adapter.
 * 
 * @example
 * spring('.box', { scale: 1.5 }, { stiffness: 300, damping: 20 });
 */
export function spring(
  targets: MorphTargets,
  properties: Record<string, any>,
  springOptions?: MorphSpringOptions,
  animationOptions?: MorphAnimationOptions
): MorphControls {
  // Delegates to animate() with spring option
  return animate(targets, properties, {
    ...animationOptions,
    spring: springOptions,
    adapter: 'motion' // Forces motion adapter for springs
  });
}
