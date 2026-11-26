import type {
  MorphAnimationOptions, MorphControls, MorphGestureOptions, MorphScrollOptions,
  MorphSpringOptions, MorphSvgOptions, MorphTargets, MorphTimeline, TimelineOptions,
} from '../types';
import { onControlsCancel } from '../utils/controls';
import { animate, type AnimateArg } from './animate';
import { gesture } from './gesture';
import { isScrollTracking, scroll } from './scroll';
import { spring } from './spring';
import { svg } from './svg';
import { timeline } from './timeline';

type ScopeEntry = MorphControls | (() => void);

export interface MorphScope {
  animate(targets: MorphTargets, properties: Record<string, any>, options?: AnimateArg): MorphControls;
  spring(targets: MorphTargets, properties: Record<string, any>, options?: MorphSpringOptions, animationOptions?: MorphAnimationOptions): MorphControls;
  timeline(options?: TimelineOptions): MorphTimeline;
  scroll(animationOrCallback: MorphControls | ((progress: number) => void), options?: MorphScrollOptions): MorphControls;
  gesture(targets: MorphTargets, options: MorphGestureOptions): () => void;
  svg: {
    draw(targets: MorphTargets, options?: MorphAnimationOptions): MorphControls;
    morph(targets: MorphTargets, options: MorphSvgOptions & { d: [string, string] }): MorphControls;
    attr(targets: MorphTargets, attributes: Record<string, any>, options?: MorphAnimationOptions): MorphControls;
  };
  add<T extends ScopeEntry>(entry: T): T;
  revert(): void;
  readonly size: number;
}

/** Group animations and cleanup functions so they can be disposed of together. */
export function createScope(): MorphScope {
  let entries = new Map<ScopeEntry, () => void>();

  const track = <T extends ScopeEntry>(entry: T): T => {
    if (entries.has(entry)) return entry;
    if (typeof entry === 'function') {
      entries.set(entry, () => {});
    } else {
      const current = entries;
      const remove = () => {
        if (current.get(entry) !== unsubscribe) return;
        current.delete(entry);
        unsubscribe();
      };
      const unsubscribe = onControlsCancel(entry, remove);
      current.set(entry, unsubscribe);
      // Scroll tracking can remain active after its controls report completion.
      void entry.finished.then(isScrollTracking(entry) ? undefined : remove, remove);
    }
    return entry;
  };

  return {
    animate: (...args) => track(animate(...args)),
    spring: (...args) => track(spring(...args)),
    timeline: (...args) => track(timeline(...args)),
    scroll: (...args) => track(scroll(...args)),
    gesture: (...args) => {
      const cleanup = gesture(...args);
      let active = true;
      const stop = () => {
        if (!active) return;
        active = false;
        entries.delete(stop);
        cleanup();
      };
      return track(stop);
    },
    svg: {
      draw: (...args) => track(svg.draw(...args)),
      morph: (...args) => track(svg.morph(...args)),
      attr: (...args) => track(svg.attr(...args)),
    },
    add: entry => track(entry),
    revert() {
      const current = entries;
      entries = new Map();
      const errors: unknown[] = [];
      for (const [entry, unsubscribe] of current) {
        unsubscribe();
        try {
          if (typeof entry === 'function') entry();
          else entry.cancel();
        } catch (error) {
          errors.push(error);
        }
      }
      current.clear();
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, '[MorphJS] Scope cleanup failed');
    },
    get size() { return entries.size; },
  };
}
