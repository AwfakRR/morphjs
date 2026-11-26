import {
  animate,
  spring,
  timeline,
  stagger,
  scroll,
  gesture,
  svg,
  type AnimateArg,
} from './api';
import type { MorphTargets, MorphControls } from './types';

export { animate, spring, timeline, stagger, scroll, gesture, svg };
export { loadGsap } from './engine';
export type * from './types';
export type { MorphInViewOptions } from './in-view';

export interface MorphCallable {
  (targets: MorphTargets, properties: Record<string, any>, options?: AnimateArg): MorphControls;
  animate: typeof animate;
  timeline: typeof timeline;
  spring: typeof spring;
  stagger: typeof stagger;
  scroll: typeof scroll;
  gesture: typeof gesture;
  svg: typeof svg;
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
  }
);

export default morph;
