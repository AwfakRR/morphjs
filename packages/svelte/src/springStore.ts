import { writable, type Writable } from 'svelte/store';
import { animate, type MorphSpringOptions } from 'morphjs';

export interface MorphSpringStore extends Writable<number> {
  set: (value: number) => void;
}

/**
 * A Svelte readable store that smoothly springs to its target value.
 * 
 * @param initialValue - Starting value
 * @param springOptions - MorphJS spring configuration
 * @returns Svelte store with .set() that animates
 */
export function springStore(
  initialValue: number = 0,
  springOptions?: MorphSpringOptions
): MorphSpringStore {
  const store = writable<number>(initialValue);
  let currentValue = initialValue;
  let currentAnim: any = null;
  const proxy = { val: initialValue };

  return {
    subscribe: store.subscribe,
    update: store.update,
    set: (nextValue: number) => {
      if (typeof window !== 'undefined') {
        if (currentAnim && typeof currentAnim.cancel === 'function') {
          currentAnim.cancel();
        }
        proxy.val = currentValue;
        currentAnim = animate(
          proxy as any,
          { val: nextValue },
          {
            spring: springOptions ?? true,
            onUpdate: () => {
              currentValue = proxy.val;
              store.set(currentValue);
            }
          }
        );
      } else {
        currentValue = nextValue;
        store.set(nextValue);
      }
    }
  };
}
