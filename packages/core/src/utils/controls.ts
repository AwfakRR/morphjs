import type { MorphControls } from '../types';

const cancelListeners = new WeakMap<MorphControls, Set<() => void>>();

export function onControlsCancel(controls: MorphControls, listener: () => void): () => void {
  let listeners = cancelListeners.get(controls);
  if (!listeners) cancelListeners.set(controls, (listeners = new Set()));
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && cancelListeners.get(controls) === listeners) {
      cancelListeners.delete(controls);
    }
  };
}

export function notifyControlsCanceled(controls: MorphControls): void {
  const listeners = cancelListeners.get(controls);
  cancelListeners.delete(controls);
  listeners?.forEach(listener => listener());
}

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
