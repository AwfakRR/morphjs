import { onUnmounted } from 'vue';
import { createScope, stateManager } from 'morphjs';

/**
 * Composable for MorphJS animations that cleans up on unmount.
 */
export function useMorph() {
  const scope = createScope();
  onUnmounted(scope.revert);
  const { animate, spring, timeline, gesture, scroll, svg } = scope;
  return {
    animate,
    spring,
    timeline,
    gesture,
    scroll,
    svg,
    state: stateManager
  };
}
