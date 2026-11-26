import { useRef, useCallback } from 'react';
import type { MorphAnimationOptions, MorphControls } from 'morphjs';
import { useMorphScope } from './useMorphScope';

/**
 * useAnimate hook allows scoping animations to a specific React element tree.
 * @returns A tuple containing a ref to attach to the scope element, and a scoped animate function.
 */
export function useAnimate<T extends Element = HTMLElement>() {
  const scopeRef = useRef<T>(null);
  const scope = useMorphScope();

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
      } else if (typeof Element !== 'undefined' && selectorOrTarget instanceof Element) {
        targets = [selectorOrTarget];
      } else if (Array.isArray(selectorOrTarget) || (typeof NodeList !== 'undefined' && selectorOrTarget instanceof NodeList)) {
        targets = Array.from(selectorOrTarget as Iterable<Element>);
      }

      if (targets.length === 0) return null;

      return scope.animate(targets, keyframes, options);
    },
    [scope]
  );

  return [scopeRef, animateScoped] as const;
}
