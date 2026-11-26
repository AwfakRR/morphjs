import { onDestroy } from 'svelte';
import { createScope } from 'morphjs';

/** Create an animation scope during component initialization. */
export function morphScope() {
  const scope = createScope();
  onDestroy(scope.revert);
  return scope;
}
