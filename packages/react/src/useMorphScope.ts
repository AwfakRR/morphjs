import { useEffect, useLayoutEffect, useState } from 'react';
import { createScope, type MorphScope } from 'morphjs';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Create a stable animation scope that reverts when the component unmounts. */
export function useMorphScope(): MorphScope {
  const [scope] = useState(createScope);
  useIsomorphicLayoutEffect(() => scope.revert, [scope]);
  return scope;
}
