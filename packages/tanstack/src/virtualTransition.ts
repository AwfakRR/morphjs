import { animate } from 'morphjs';

/**
 * Configuration options for virtual item transitions
 */
export interface VirtualTransitionOptions {
  /**
   * The animation type for item entrance
   */
  enterType?: 'fade' | 'slide' | 'pop';
  /**
   * Base duration for animations in seconds
   */
  duration?: number;
  /**
   * Stagger delay between items in seconds
   */
  stagger?: number;
}

/**
 * Creates a transition controller for @tanstack/virtual items.
 * Animates entering items and manages layout transitions.
 * 
 * @param options - Configuration for virtual transitions
 * @returns Transition hooks for virtual items
 */
export function createVirtualItemTransition(options: VirtualTransitionOptions = {}) {
  const {
    enterType = 'fade',
    duration = 0.2,
    stagger = 0.03,
  } = options;

  const animatedItems = new Set<string | number>();

  return {
    /**
     * Animate a virtual item when it enters the viewport
     * @param element The DOM element of the virtual item
     * @param index The index or unique ID of the item
     */
    animateEnter(element: HTMLElement, index: number | string) {
      if (typeof window === 'undefined' || !element) return;
      
      // Prevent re-animating items that are just scrolling in and out
      if (animatedItems.has(index)) return;
      animatedItems.add(index);

      const properties: Record<string, any> = { opacity: [0, 1] };

      if (enterType === 'slide') {
        properties.y = [20, 0];
      } else if (enterType === 'pop') {
        properties.scale = [0.9, 1];
      }

      const delay = (typeof index === 'number' ? index % 20 : 0) * stagger;

      return animate(element, properties, {
        duration,
        ease: 'easeOut',
        delay,
      });
    },
    
    /**
     * Resets the tracked animated items so they can animate again
     */
    reset() {
      animatedItems.clear();
    }
  };
}
