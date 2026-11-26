// Core API
export { animate } from './api/animate';
export { timeline } from './api/timeline';
export { spring } from './api/spring';
export { stagger } from './api/stagger';
export { scroll } from './api/scroll';
export type { MorphInViewOptions } from './api/in-view';
export { gesture } from './api/gesture';
export { svg } from './api/svg';
export { createScope } from './api/scope';

// Types (re-export all)
export type { MorphScope } from './api/scope';
export type { 
  MorphControls, MorphTimeline, MorphAnimationOptions, MorphSpringOptions,
  MorphStaggerOptions, MorphScrollOptions, MorphGestureOptions, MorphSvgOptions,
  TimelineOptions, TimelineSegment, MorphTargets, MorphTarget,
  IAnimationAdapter, AdapterPlugin, AdapterCapability, AdapterType,
  MorphConfig, EasingFunction, EasingValue, CubicBezier,
  AnimationEvent, AnimationEventType, GestureInfo
} from './types';

// Configuration & utilities
export { configure, getConfig } from './router';
export { adapterRegistry } from './adapters/adapter';
export { stateManager } from './state';
export { animationEvents } from './events';
export { resolveEasing, registerEasing, toMotionEasing, toAnimeEasing, toGsapEasing } from './easing/easing';
export { resolveTargets } from './utils/targets';

// Adapters (for advanced usage / plugin authors)
export { motionAdapter } from './adapters/motion-adapter';
export { animeAdapter } from './adapters/anime-adapter';
export { gsapAdapter } from './adapters/gsap-adapter';

// Auto-register built-in adapters
import { motionAdapter } from './adapters/motion-adapter';
import { animeAdapter } from './adapters/anime-adapter';
import { adapterRegistry } from './adapters/adapter';
import { animate } from './api/animate';
import { timeline } from './api/timeline';
import { spring } from './api/spring';
import { stagger } from './api/stagger';
import { scroll } from './api/scroll';
import { gesture } from './api/gesture';
import { svg } from './api/svg';
import { createScope } from './api/scope';
import { configure, getConfig } from './router';
import { stateManager } from './state';
import { animationEvents } from './events';
import type { MorphTargets, MorphControls } from './types';
import type { AnimateArg } from './api/animate';

adapterRegistry.register({
  name: 'motion',
  adapter: motionAdapter,
  priority: 10,
  capabilities: ['tween', 'spring', 'scroll', 'gesture', 'layout'],
});

adapterRegistry.register({
  name: 'anime',
  adapter: animeAdapter,
  priority: 10,
  capabilities: ['tween', 'timeline', 'stagger', 'svg'],
});

// GSAP — specialist engine for advanced ScrollTrigger, MorphSVG, pro timelines
import { gsapAdapter } from './adapters/gsap-adapter';
adapterRegistry.register({
  name: 'gsap',
  adapter: gsapAdapter,
  priority: 5,
  capabilities: ['tween', 'timeline', 'stagger', 'scroll', 'svg'],
});

/**
 * Callable MorphJS instance — the shortest way to animate in JavaScript.
 *
 * @example
 * // 1-liner with duration shorthand
 * morph('.box', { x: 100 }, 0.5);
 *
 * // Spring physics
 * morph.spring('.box', { scale: 1.2 });
 *
 * // Timeline
 * morph.timeline().add('.a', { x: 100 });
 */
export interface MorphCallable {
  (targets: MorphTargets, properties: Record<string, any>, options?: AnimateArg): MorphControls;
  animate: typeof animate;
  timeline: typeof timeline;
  spring: typeof spring;
  stagger: typeof stagger;
  scroll: typeof scroll;
  gesture: typeof gesture;
  svg: typeof svg;
  scope: typeof createScope;
  configure: typeof configure;
  getConfig: typeof getConfig;
  state: typeof stateManager;
  events: typeof animationEvents;
  adapters: typeof adapterRegistry;
}

export const morph: MorphCallable = Object.assign(
  (targets: MorphTargets, properties: Record<string, any>, options?: AnimateArg) =>
    animate(targets, properties, options),
  {
    animate,
    timeline,
    spring,
    stagger,
    scroll,
    gesture,
    svg,
    scope: createScope,
    configure,
    getConfig,
    state: stateManager,
    events: animationEvents,
    adapters: adapterRegistry,
  }
);

export default morph;
