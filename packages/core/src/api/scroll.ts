import type { MorphTargets, MorphAnimationOptions, MorphScrollOptions, MorphControls } from '../types';
import { resolveAdapter } from '../router';
import { stateManager } from '../state';
import { animationEvents } from '../events';
import { createNoopControls } from '../utils/controls';
import { animate } from './animate';

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
  let controls: MorphControls = createNoopControls();

  if (typeof animationOrCallback === 'function') {
    let handled = false;
    if (adapter.scroll) {
      try {
        controls = adapter.scroll(animationOrCallback, options);
        handled = true;
      } catch {
        // Fallback to native listener
      }
    }
    if (!handled) {
      let lastScroll = -1;
      const targetEl = options?.container || options?.target;
      const scrollEl = targetEl instanceof Element ? targetEl : document.documentElement;
      const eventTarget = targetEl instanceof Element ? targetEl : window;

      const onScroll = () => {
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        const scrollY = scrollEl.scrollTop;
        const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll)) : 0;
        
        if (progress !== lastScroll) {
          lastScroll = progress;
          animationOrCallback(progress);
        }
      };
      
      eventTarget.addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      controls = {
        ...createNoopControls(),
        cancel: () => eventTarget.removeEventListener('scroll', onScroll),
        playState: 'running'
      };
    }
  } else {
    if (adapter.scroll) {
      try {
        controls = adapter.scroll(animationOrCallback, options);
      } catch {
        controls = animationOrCallback;
      }
    } else {
      controls = animationOrCallback;
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
