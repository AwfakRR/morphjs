import { useRef, useCallback } from 'react';
import { morph } from 'morphjs';
import type { MorphAnimationOptions, MorphControls } from 'morphjs';

/**
 * useAnimate hook allows scoping animations to a specific React element tree.
 * @returns A tuple containing a ref to attach to the scope element, and a scoped animate function.
 */
export function useAnimate<T extends Element = HTMLElement>() {
  const scopeRef = useRef<T>(null);

  const animateScoped = useCallback(
    (
      selectorOrTarget: string | Element | Element[] | NodeListOf<Element>,
      keyframes: any,
      options?: MorphAnimationOptions
    ): MorphControls | null => {
      if (typeof window === 'undefined') return null;

      let targets: Element[] = [];

      if (typeof selectorOrTarget === 'string') {
        if (scopeRef.current) {
          targets = Array.from(scopeRef.current.querySelectorAll(selectorOrTarget));
        }
      } else if (selectorOrTarget instanceof Element) {
        targets = [selectorOrTarget];
      } else if (selectorOrTarget instanceof NodeList || Array.isArray(selectorOrTarget)) {
        targets = Array.from(selectorOrTarget as Iterable<Element>);
      }

      if (targets.length === 0) return null;

      return morph.animate(targets, keyframes, options);
    },
    []
  );

  return [scopeRef, animateScoped] as const;
}
