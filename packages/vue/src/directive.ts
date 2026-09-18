import { type ObjectDirective } from 'vue';
import { animate, spring, gesture } from 'morphjs';

interface MorphDirectiveBinding {
  duration?: number;
  [key: string]: any;
}

export const vMorph: ObjectDirective<HTMLElement, MorphDirectiveBinding> = {
  mounted(el, binding) {
    const { value, modifiers, arg } = binding;
    
    // Type-safe approach for attaching internals to the DOM element
    const element = el as any;
    
    if (arg === 'hover') {
      element._morphGesture = gesture(el, { hover: true, ...value });
    } else if (arg === 'drag') {
      element._morphGesture = gesture(el, { drag: true, ...value });
    } else {
      if (modifiers.spring) {
        element._morphAnim = spring(el, value);
      } else {
        element._morphAnim = animate(el, value);
      }
    }
  },
  updated(el, binding) {
    const { value, modifiers, arg } = binding;
    const element = el as any;
    
    if (arg === 'hover' || arg === 'drag') {
      // Directives for gestures might need re-initialization if options change
    } else {
      if (element._morphAnim && typeof element._morphAnim.cancel === 'function') {
        element._morphAnim.cancel();
      }
      if (modifiers.spring) {
        element._morphAnim = spring(el, value);
      } else {
        element._morphAnim = animate(el, value);
      }
    }
  },
  unmounted(el) {
    const element = el as any;
    if (element._morphAnim && typeof element._morphAnim.cancel === 'function') {
      element._morphAnim.cancel();
    }
    if (element._morphGesture && typeof element._morphGesture === 'function') {
      element._morphGesture();
    }
  }
};
