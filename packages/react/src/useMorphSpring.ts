import { useState, useCallback, useRef, useEffect } from 'react';
import { morph } from 'morphjs';
import type { MorphSpringOptions } from 'morphjs';

/**
 * useMorphSpring allows animating a numeric value using a spring physics simulation.
 * @param initialValue The starting value of the spring
 * @param springOptions Configuration for the spring physics
 * @returns A tuple containing the current animated value, and a function to update the target value
 */
export function useMorphSpring(initialValue: number, springOptions?: MorphSpringOptions) {
  const [currentValue, setCurrentValue] = useState(initialValue);
  const targetRef = useRef(initialValue);
  const proxyRef = useRef({ val: initialValue });

  useEffect(() => {
    // Keep proxy in sync if currentValue somehow changes externally
    proxyRef.current.val = currentValue;
  }, [currentValue]);

  const setTarget = useCallback(
    (nextValue: number) => {
      if (typeof window === 'undefined') return;
      if (targetRef.current === nextValue) return;
      targetRef.current = nextValue;

      morph.animate(
        proxyRef.current as any,
        { val: nextValue },
        {
          spring: springOptions,
          onUpdate: () => {
            setCurrentValue(proxyRef.current.val);
          }
        }
      );
    },
    [springOptions]
  );

  return [currentValue, setTarget] as const;
}
