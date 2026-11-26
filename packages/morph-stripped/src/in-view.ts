export interface MorphInViewOptions {
  container?: Element;
  margin?: string;
  threshold?: number;
  once?: boolean;
}

export function inView(
  target: string | Element | ArrayLike<Element>,
  onEnter: (element: Element, entry: IntersectionObserverEntry) => void,
  { container, margin, threshold = 0, once = true }: MorphInViewOptions = {},
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return () => {};
  }

  const elements = typeof target === 'string' ? document.querySelectorAll(target)
    : 'nodeType' in target ? [target] : target;
  const visibility = new Map(Array.from(elements, element => [element, false]));
  if (!visibility.size) return () => {};

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const previous = visibility.get(entry.target);
      if (previous === undefined) continue;
      const visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
      if (visible === previous) continue;
      if (!visible || !once) {
        visibility.set(entry.target, visible);
      } else {
        visibility.delete(entry.target);
        observer.unobserve(entry.target);
      }
      if (visible) onEnter(entry.target, entry);
    }
  }, { root: container, rootMargin: margin, threshold });

  for (const element of visibility.keys()) observer.observe(element);
  return () => {
    visibility.clear();
    observer.disconnect();
  };
}
