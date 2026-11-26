import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { morph } from 'morphjs';
import type { MorphControls, MorphSpringOptions } from 'morphjs';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface SpringAnimation {
  proxy: { val: number };
  target?: number;
  controls?: MorphControls;
}

/**
 * useMorphSpring allows animating a numeric value using a spring physics simulation.
 * @param initialValue The starting value of the spring
 * @param springOptions Configuration for the spring physics
 * @returns A tuple containing the current animated value, and a function to update the target value
 */
export function useMorphSpring(initialValue: number, springOptions?: MorphSpringOptions) {
  const [currentValue, setCurrentValue] = useState(initialValue);
  const springRef = useRef<SpringAnimation>({ proxy: { val: initialValue }, target: initialValue });
  const mountedRef = useRef(true);

  useIsomorphicLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const previous = springRef.current;
      springRef.current = { proxy: { val: previous.proxy.val } };
      previous.controls?.cancel();
    };
  }, []);

  const setTarget = useCallback(
    (nextValue: number) => {
      if (typeof window === 'undefined' || !mountedRef.current) return;
      const previous = springRef.current;
      if (previous.target === nextValue) return;

      const proxy = { val: previous.proxy.val };
      const animation: SpringAnimation = { proxy, target: nextValue };
      springRef.current = animation;
      previous.controls?.cancel();

      animation.controls = morph.animate(
        proxy as any,
        { val: nextValue },
        {
          spring: springOptions ?? true,
          onUpdate: () => {
            if (springRef.current === animation) setCurrentValue(proxy.val);
          }
        }
      );
      if (springRef.current !== animation) animation.controls.cancel();
    },
    [springOptions]
  );

  return [currentValue, setTarget] as const;
}
