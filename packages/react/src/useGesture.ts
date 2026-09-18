import { useRef, useEffect } from 'react';
import { morph } from 'morphjs';
import type { MorphGestureOptions } from 'morphjs';

/**
 * useGesture attaches gesture interactions (hover, tap, drag) to a React element.
 * @param options Gesture configuration options
 * @returns A ref to attach to the target element
 */
export function useGesture<T extends Element = HTMLElement>(options: MorphGestureOptions) {
  const ref = useRef<T>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!ref.current) return;

    // Attach gestures via MorphJS
    const cleanup = morph.gesture(ref.current, optionsRef.current);

    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [ref]);

  return ref;
}
