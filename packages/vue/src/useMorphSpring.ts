import { ref, type Ref } from 'vue';
import { animate, type MorphSpringOptions } from 'morphjs';

export interface UseMorphSpringReturn {
  value: Ref<number>;
  set: (next: number) => void;
}

/**
 * Creates a reactive spring value.
 * @param initialValue - The initial numeric value
 * @param springOptions - Options for the spring animation
 */
export function useMorphSpring(
  initialValue: number,
  springOptions?: MorphSpringOptions
): UseMorphSpringReturn {
  const value = ref(initialValue);
  let currentAnim: any = null;
  const proxy = { val: initialValue };

  const set = (next: number) => {
    if (currentAnim && typeof currentAnim.cancel === 'function') {
      currentAnim.cancel();
    }
    proxy.val = value.value;
    currentAnim = animate(
      proxy as any,
      { val: next },
      {
        spring: springOptions ?? true,
        onUpdate: () => {
          value.value = proxy.val;
        }
      }
    );
  };

  return {
    value,
    set
  };
}
