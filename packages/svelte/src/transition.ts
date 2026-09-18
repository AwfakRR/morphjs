import type { TransitionConfig } from 'svelte/transition';

export interface TransitionParams {
  delay?: number;
  duration?: number;
  easing?: (t: number) => number;
  css?: (t: number, u: number) => string;
}

/**
 * Svelte transition compatible with in/out morphTransition.
 * Uses MorphJS configuration and CSS generators.
 * 
 * @param node - The HTMLElement transitioning
 * @param params - Transition parameters
 * @returns Svelte transition config
 */
export function morphTransition(
  node: HTMLElement,
  params: TransitionParams = {}
): TransitionConfig {
  const {
    delay = 0,
    duration = 400,
    easing = (t: number) => t, // fallback linear easing if no Morph preset
    css = (t: number, u: number) => `opacity: ${t};` // simple fallback
  } = params;

  return {
    delay,
    duration,
    easing,
    css
  };
}
