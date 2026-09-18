import { animate, type MorphAnimationOptions } from 'morphjs';

/**
 * Options for configuring route transitions
 */
export interface RouteTransitionOptions {
  /**
   * Animation to play when a route enters
   */
  enterAnimation?: 'fade' | 'slide-in-right' | 'slide-in-left' | 'zoom-in';
  /**
   * Animation to play when a route exits
   */
  exitAnimation?: 'fade' | 'slide-out-right' | 'slide-out-left' | 'zoom-out';
  /**
   * Duration of the transition in seconds
   */
  duration?: number;
  /**
   * Easing function for the transition
   */
  ease?: string;
}

/**
 * Creates a route transition controller for TanStack Router.
 * This function provides hooks to animate page enter/exit safely across environments.
 * 
 * @param options - Configuration for the route transition
 * @returns Transition hooks to be used with router layouts
 */
export function createRouteTransition(options: RouteTransitionOptions = {}) {
  const {
    enterAnimation = 'fade',
    exitAnimation = 'fade',
    duration = 0.3,
    ease = 'easeInOut',
  } = options;

  return {
    /**
     * Animate a newly mounted route container in
     * @param element The DOM element wrapping the route
     */
    enter(element: HTMLElement) {
      if (typeof window === 'undefined' || !element) return;
      
      const properties: Record<string, any> = { opacity: [0, 1] };

      if (enterAnimation === 'slide-in-right') {
        properties.x = [50, 0];
      } else if (enterAnimation === 'slide-in-left') {
        properties.x = [-50, 0];
      } else if (enterAnimation === 'zoom-in') {
        properties.scale = [0.95, 1];
      }

      return animate(element, properties, { duration, ease });
    },

    /**
     * Animate a route container out before it unmounts
     * @param element The DOM element wrapping the route
     * @returns A promise that resolves when the exit animation completes
     */
    exit(element: HTMLElement): Promise<void> {
      if (typeof window === 'undefined' || !element) return Promise.resolve();

      const properties: Record<string, any> = { opacity: 0 };

      if (exitAnimation === 'slide-out-left') {
        properties.x = -50;
      } else if (exitAnimation === 'slide-out-right') {
        properties.x = 50;
      } else if (exitAnimation === 'zoom-out') {
        properties.scale = 0.95;
      }

      const controls = animate(element, properties, { duration, ease });
      return controls ? controls.finished : Promise.resolve();
    },
  };
}
