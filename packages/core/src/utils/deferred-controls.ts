import type { MorphControls } from '../types';
import { notifyControlsCanceled } from './controls';

const deferredSeek = new WeakMap<MorphControls, (progress: number) => void>();

export function seekControlsProgress(controls: MorphControls, progress: number): void {
  const seek = deferredSeek.get(controls);
  if (seek) seek(progress);
  else controls.seek?.(progress * (controls.duration ?? 0));
}

export function createDeferredControls() {
  let real: MorphControls | null = null;
  const q: Array<(c: MorphControls) => void> = [];
  let res: () => void, rej: (err: any) => void;
  const finished = new Promise<void>((r, e) => { res = r; rej = e; });
  const run = (fn: (c: MorphControls) => void) => (real ? fn(real) : q.push(fn));

  const controls: MorphControls = {
    play: () => run(c => c.play()),
    pause: () => run(c => c.pause()),
    reverse: () => run(c => c.reverse()),
    cancel: () => {
      run(c => c.cancel());
      notifyControlsCanceled(controls);
    },
    finish: () => run(c => c.finish()),
    restart: () => run(c => c.restart()),
    commitStyles: () => run(c => c.commitStyles()),
    seek: (time: number) => run(c => c.seek?.(time)),
    get duration() { return real?.duration; },
    get progress() { return real?.progress ?? 0; },
    get currentTime() { return real?.currentTime ?? 0; },
    get playState() { return real?.playState ?? 'idle'; },
    finished,
    then: (onF, onR) => finished.then(onF, onR),
  };
  deferredSeek.set(controls, progress => run(c => seekControlsProgress(c, progress)));

  return {
    controls,
    reject: (reason: unknown) => rej(reason),
    resolve: (c: MorphControls) => {
      real = c;
      c.finished.then(res, rej);
      q.forEach(fn => fn(c));
      q.length = 0;
    },
  };
}
