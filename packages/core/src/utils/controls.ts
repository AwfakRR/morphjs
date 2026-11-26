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

export function groupControls(controls: MorphControls[]): MorphControls {
  const first = controls[0];
  const finished = () => Promise.all(controls.map(control => control.finished)).then(() => {});
  return {
    play: () => controls.forEach(control => control.play()),
    pause: () => controls.forEach(control => control.pause()),
    reverse: () => controls.forEach(control => control.reverse()),
    cancel: () => controls.forEach(control => control.cancel()),
    finish: () => controls.forEach(control => control.finish()),
    restart: () => controls.forEach(control => control.restart()),
    seek: time => controls.forEach(control => control.seek?.(time)),
    commitStyles: () => controls.forEach(control => control.commitStyles()),
    get progress() { return first.progress; },
    get currentTime() { return first.currentTime; },
    get playState() {
      return controls.find(control => control.playState === 'running')?.playState
        ?? controls.find(control => control.playState === 'paused')?.playState
        ?? first.playState;
    },
    get finished() { return finished(); },
    then: (onFulfilled, onRejected) => finished().then(onFulfilled, onRejected),
  };
}
