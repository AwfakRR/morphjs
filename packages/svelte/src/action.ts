import { animate, gesture as morphGesture } from 'morphjs';
import type { MorphAnimationOptions, MorphGestureOptions, MorphControls } from 'morphjs';

export interface ActionOptions extends MorphAnimationOptions {
  animate?: Record<string, any>;
  properties?: Record<string, any>;
}

/**
 * Svelte action for running MorphJS animations on a node.
 * 
 * @param node - The HTMLElement to animate
 * @param options - MorphJS options combined with 'animate' or 'properties' property
 */
export function morphAction(node: HTMLElement, options: ActionOptions) {
  let controls: MorphControls | null = null;

  if (typeof window !== 'undefined') {
    const { animate: props, properties, ...rest } = options;
    const animProps = props || properties || {};
    controls = animate(node, animProps, rest);
  }

  return {
    update(newOptions: ActionOptions) {
      if (typeof window !== 'undefined') {
        if (controls && typeof controls.cancel === 'function') {
          controls.cancel();
        }
        const { animate: props, properties, ...rest } = newOptions;
        const animProps = props || properties || {};
        controls = animate(node, animProps, rest);
      }
    },
    destroy() {
      if (controls && typeof controls.cancel === 'function') {
        controls.cancel();
        controls = null;
      }
    }
  };
}

/**
 * Svelte action for applying MorphJS gestures on a node.
 * 
 * @param node - The HTMLElement to apply gesture bindings to
 * @param options - Gesture options (e.g. drag, hover, press)
 */
export function gesture(node: HTMLElement, options: MorphGestureOptions) {
  let cleanup: (() => void) | null = null;

  if (typeof window !== 'undefined') {
    cleanup = morphGesture(node, options);
  }

  return {
    update(newOptions: MorphGestureOptions) {
      if (typeof window !== 'undefined') {
        if (cleanup) cleanup();
        cleanup = morphGesture(node, newOptions);
      }
    },
    destroy() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    }
  };
}
