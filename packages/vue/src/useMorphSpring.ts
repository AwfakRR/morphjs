import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import { animate, type MorphControls, type MorphSpringOptions } from 'morphjs';

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
  let currentAnim: { controls?: MorphControls } | undefined;
  let disposed = false;

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      const previous = currentAnim;
      currentAnim = undefined;
      previous?.controls?.cancel();
    });
  }

  const set = (next: number) => {
    if (disposed) return;
    const previous = currentAnim;
    const animation: { controls?: MorphControls } = {};
    currentAnim = animation;
    previous?.controls?.cancel();

    const proxy = { val: value.value };
    animation.controls = animate(
      proxy as any,
      { val: next },
      {
        spring: springOptions ?? true,
        onUpdate: () => {
          if (currentAnim === animation) value.value = proxy.val;
        }
      }
    );
    if (currentAnim !== animation) animation.controls.cancel();
  };

  return {
    value,
    set
  };
}
