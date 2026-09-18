import { onUnmounted } from 'vue';
import { animate, spring, timeline, gesture, scroll, svg, stateManager } from 'morphjs';

/**
 * Composable for MorphJS animations that cleans up on unmount.
 */
export function useMorph() {
  const activeAnimations: Set<any> = new Set();

  const createAnim = (fn: any, ...args: any[]) => {
    const anim = fn(...args);
    if (anim && typeof anim.cancel === 'function') {
      activeAnimations.add(anim);
      if (typeof anim.then === 'function') {
        anim.then(() => {
          activeAnimations.delete(anim);
        });
      }
    }
    return anim;
  };

  const boundAnimate = (...args: Parameters<typeof animate>) => createAnim(animate, ...args);
  const boundSpring = (...args: Parameters<typeof spring>) => createAnim(spring, ...args);
  const boundTimeline = (...args: Parameters<typeof timeline>) => createAnim(timeline, ...args);

  onUnmounted(() => {
    activeAnimations.forEach(anim => {
      if (typeof anim.cancel === 'function') {
        anim.cancel();
      }
    });
    activeAnimations.clear();
  });

  return {
    animate: boundAnimate,
    spring: boundSpring,
    timeline: boundTimeline,
    gesture,
    scroll,
    svg,
    state: stateManager
  };
}
