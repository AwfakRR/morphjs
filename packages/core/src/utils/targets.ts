import { MorphTargets } from '../types';

export function isValidTarget(target: unknown): target is Element {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  return target instanceof Element;
}

export function resolveTargets(targets: MorphTargets): Element[] {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return [];
  }

  const resolved = new Set<Element>();

  const processTarget = (t: any) => {
    if (typeof t === 'string') {
      try {
        const elements = document.querySelectorAll(t);
        elements.forEach(el => resolved.add(el));
      } catch (e) {
        // Invalid selector, ignore
      }
    } else if (isValidTarget(t)) {
      resolved.add(t);
    } else if (t instanceof NodeList || Array.isArray(t)) {
      (t as any).forEach((item: any) => {
        if (isValidTarget(item)) {
          resolved.add(item);
        } else if (typeof item === 'string') {
            processTarget(item);
        }
      });
    }
  };

  processTarget(targets);
  return Array.from(resolved);
}
