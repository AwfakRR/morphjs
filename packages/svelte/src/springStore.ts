import { writable, type Writable } from 'svelte/store';
import { animate, type MorphControls, type MorphSpringOptions } from 'morphjs';

export interface MorphSpringStore extends Writable<number> {
  set: (value: number) => void;
}

/**
 * A Svelte writable store with an animated set() and an immediate update().
 * 
 * @param initialValue - Starting value
 * @param springOptions - MorphJS spring configuration
 */
export function springStore(
  initialValue: number = 0,
  springOptions?: MorphSpringOptions
): MorphSpringStore {
  const store = writable<number>(initialValue);
  let currentValue = initialValue;
  let currentAnimation: { controls?: MorphControls } | undefined;

  const publish = (value: number) => {
    currentValue = value;
    store.set(value);
  };

  const cancelAnimation = () => {
    const animation = currentAnimation;
    currentAnimation = undefined;
    animation?.controls?.cancel();
  };

  return {
    subscribe: store.subscribe,
    update: (updater) => {
      const nextValue = updater(currentValue);
      cancelAnimation();
      publish(nextValue);
    },
    set: (nextValue: number) => {
      cancelAnimation();
      if (typeof window !== 'undefined') {
        const proxy = { val: currentValue };
        const animation: { controls?: MorphControls } = {};
        currentAnimation = animation;
        animation.controls = animate(
          proxy as any,
          { val: nextValue },
          {
            spring: springOptions ?? true,
            onUpdate: () => {
              if (currentAnimation === animation) publish(proxy.val);
            }
          }
        );
        if (currentAnimation !== animation) animation.controls.cancel();
      } else {
        publish(nextValue);
      }
    }
  };
}
