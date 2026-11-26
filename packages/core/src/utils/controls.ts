import type { MorphControls } from '../types';

/**
 * Creates a no-op MorphControls instance for SSR fallbacks.
 */
export function createNoopControls(): MorphControls {
  return {
    play: () => {},
    pause: () => {},
    reverse: () => {},
    cancel: () => {},
    finish: () => {},
    restart: () => {},
    progress: 0,
    currentTime: 0,
    playState: 'idle',
    finished: Promise.resolve(),
    then: function(onFulfilled) {
      if (onFulfilled) onFulfilled();
      return Promise.resolve();
    },
    commitStyles: () => {}
  };
}
