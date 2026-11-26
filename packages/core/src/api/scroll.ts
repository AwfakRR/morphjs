import type { MorphScrollOptions, MorphControls } from '../types';
import { resolveAdapter } from '../router';
import { stateManager } from '../state';
import { animationEvents } from '../events';
import { ensureScrollTrigger, gsapAdapter } from '../adapters/gsap-adapter';
import { createDeferredControls } from '../utils/deferred-controls';
import { createNoopControls } from '../utils/controls';

/**
 * Create a scroll-linked animation.
 * The animation progress is tied to scroll position rather than time.
 *
 * @example
 * // Progress bar that fills as user scrolls the page
 * scroll(
 *   animate('.progress-bar', { scaleX: [0, 1] }),
 *   { target: document.querySelector('.section') }
 * );
 *
 * @example
 * // Animate on scroll with axis control
 * scroll(
 *   animate('.parallax', { y: [0, -200] }),
 *   { axis: 'y', offset: ['start end', 'end start'] }
 * );
 *
 * @example
 * // Callback-based scroll tracking
 * scroll((progress) => {
 *   console.log(`Scroll progress: ${progress}`);
 * });
 */
export function scroll(
  animationOrCallback: MorphControls | ((progress: number) => void),
  options?: MorphScrollOptions
): MorphControls {
  if (typeof window === 'undefined') {
    return createNoopControls();
  }

  const adapter = resolveAdapter({
    scroll: true,
    adapter: (options as any)?.adapter,
    engine: (options as any)?.engine,
  });
  const fallback = (): MorphControls => {
    if (typeof animationOrCallback !== 'function') return animationOrCallback;
    let lastScroll = -1;
    const targetEl = options?.container || options?.target;
    const scrollEl = targetEl instanceof Element ? targetEl : document.documentElement;
    const eventTarget = targetEl instanceof Element ? targetEl : window;

    const onScroll = () => {
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollEl.scrollTop / maxScroll)) : 0;
      if (progress !== lastScroll) {
        lastScroll = progress;
        animationOrCallback(progress);
      }
    };
    eventTarget.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return {
      ...createNoopControls(),
      cancel: () => eventTarget.removeEventListener('scroll', onScroll),
      playState: 'running',
    };
  };

  let controls: MorphControls;
  try {
    controls = adapter.scroll?.(animationOrCallback, options) ?? fallback();
  } catch {
    const ensure = adapter === gsapAdapter ? ensureScrollTrigger : adapter.ensure?.bind(adapter);
    if (!ensure) {
      controls = fallback();
    } else {
      const deferred = createDeferredControls();
      void ensure().then(() => {
        if (!adapter.scroll) return deferred.resolve(fallback());
        let result: MorphControls;
        try {
          result = adapter.scroll(animationOrCallback, options);
        } catch {
          result = fallback();
        }
        deferred.resolve(result);
      }, () => deferred.resolve(fallback())).catch(deferred.reject);
      controls = deferred.controls;
    }
  }

  const target = options?.target || document.documentElement;
  stateManager.register(controls, target);

  animationEvents.emit('start', {
    type: 'start',
    target,
    controls,
    timestamp: performance.now()
  });

  return controls;
}
