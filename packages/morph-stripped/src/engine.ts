import type { MorphControls, MorphSpringOptions } from './types';

const load = <T>(fn: () => Promise<T>) => {
  let p: Promise<T>;
  return () => (p ||= fn());
};

export const loadMotion = load(() => import('motion').then((m: any) => m.animate ? m : m.default || m));
export const loadAnime = load(() => import('animejs').then((m: any) => m.animate ? m : m.default || m));
export const loadGsapCore = load(() => import('gsap').then(g => ({ gsap: g.gsap || g.default || g })));

function loadGsapPlugin<K extends string>(name: K, importer: () => Promise<Record<K, any>>) {
  return load(async () => {
    const [{ gsap }, mod] = await Promise.all([loadGsapCore(), importer().catch(() => null)]);
    const plugin = mod?.[name] ?? null;
    if (plugin) gsap.registerPlugin(plugin);
    return { gsap, [name]: plugin } as { gsap: typeof gsap } & Record<K, any>;
  });
}

export const loadScrollTrigger = loadGsapPlugin('ScrollTrigger', () => import('gsap/ScrollTrigger'));
export const loadMorphSVG = loadGsapPlugin('MorphSVGPlugin', () => import('gsap/MorphSVGPlugin'));
export const loadDrawSVG = loadGsapPlugin('DrawSVGPlugin', () => import('gsap/DrawSVGPlugin'));

export const loadGsap = load(async () => {
  const [scroll, morph, draw] = await Promise.all([loadScrollTrigger(), loadMorphSVG(), loadDrawSVG()]);
  return { ...scroll, ...morph, ...draw };
});

export function wrap(
  anim: any,
  type: 'm'|'a'|'g',
  frame?: typeof import('motion').frame,
  onCancel?: () => void,
): MorphControls {
  const isA = type === 'a', isG = type === 'g', isM = type === 'm';
  const tracks = isM ? anim.animations ?? [anim] : [];
  const legacyEnds = isM && !('state' in anim) ? new WeakMap<object, number>() : undefined;
  if (legacyEnds) {
    for (const track of tracks) {
      if (typeof track.attachTimeline !== 'function' || !('resolved' in track) || !track.options?.motionValue) continue;
      const { onComplete, motionValue } = track.options;
      track.options.onComplete = () => {
        const resolved = track.resolved;
        if (resolved?.animation) {
          // Motion 11 always commits the forward keyframe, then cancels and loses the native playhead.
          legacyEnds.set(track, track.time);
          if (track.speed < 0) motionValue.set(resolved.keyframes[0]);
        }
        onComplete?.();
      };
    }
  }
  const pendingTimes = isM ? new WeakMap<object, { time: number }>() : undefined;
  const driverOf = (track: any) => track.animation ?? track;
  const isJs = (driver: any) => typeof driver.tick === 'function';
  const delayOf = (driver: any) =>
    isJs(driver) ? (driver.options?.delay ?? 0) / 1000 : 0;
  const signedDelay = (track: any, delay: number) => track.speed < 0 ? -delay : delay;
  const readTime = (track: any, driver = driverOf(track), delay = delayOf(driver)) => {
    if (delay && track.state === 'paused' && driver.holdTime != null) {
      return Math.max(0, driver.holdTime / 1000 - signedDelay(track, delay));
    }
    return pendingTimes?.get(track)?.time ?? track.time ?? 0;
  };
  const writeTime = (track: any, time: number, delay = delayOf(driverOf(track))) => {
    // Motion's JS driver reads sampled time but writes time before its direction-dependent delay.
    track.time = time + signedDelay(track, delay);
    if (delay && frame && pendingTimes) {
      const pending = { time };
      pendingTimes.set(track, pending);
      frame.update(() => frame.postRender(() => {
        if (pendingTimes.get(track) === pending) pendingTimes.delete(track);
      }));
    }
  };
  const playMotion = (backward = false) => {
    const resuming = !backward && tracks.some((track: any) => track.state === 'paused');
    for (const track of tracks) {
      const { speed, state } = track;
      const driver = driverOf(track);
      if (resuming && state === 'finished' && isJs(driver)) continue;
      const delay = delayOf(driver);
      // A JS track can finish on a frame past its endpoint. Reversing above it renders the delay frame.
      const end = backward && state === 'finished' && speed >= 0 && isJs(driver)
        ? driver.totalDuration ?? driver.resolved?.totalDuration
        : undefined;
      const time = end == null ? legacyEnds?.get(track) ?? readTime(track, driver, delay) : end / 1000;
      legacyEnds?.delete(track);
      if (backward) track.speed = -Math.abs(speed || 1);
      const running = state === 'running';
      if (!backward || !running) track.play();
      // Motion's JS driver resumes a paused animation as though its speed were forward.
      if ((!running && (backward || speed < 0)) || (running && delay && backward && speed >= 0)) {
        writeTime(track, state === 'finished' && speed >= 0 && time === 0 ? track.duration : time, delay);
      }
    }
  };
  return {
    play: () => isM ? playMotion() : anim.play?.(),
    pause: () => {
      if (!isM) return anim.pause?.();
      for (const track of tracks) {
        const driver = driverOf(track);
        if (isJs(driver) && (driver.state === 'paused' || driver.state === 'finished')) continue;
        // Motion 11 pauses on sampled time. Keep the raw clock, including any remaining delay.
        const rawTime = delayOf(driver) && !driver.updateTime && driver.state === 'running' &&
          driver.driver && driver.startTime != null
          ? driver.holdTime ?? Math.round(driver.driver.now() - driver.startTime) * track.speed
          : undefined;
        track.pause();
        if (rawTime !== undefined) track.time = rawTime / 1000;
      }
    },
    reverse: () => isM ? playMotion(true) : anim.reverse?.(),
    cancel: () => {
      if (!isM) return isG ? anim.kill() : (anim.pause?.(), anim.seek?.(0));
      for (const track of tracks) {
        pendingTimes?.delete(track);
        legacyEnds?.delete(track);
        const driver = driverOf(track);
        if (track.speed < 0 && isJs(driver)) {
          // Rewound tracks are already settled. Cancel would sample a different keyframe.
          if (driver.state === 'finished') {
            driver.options?.onCancel?.();
            continue;
          }
          track.speed *= -1;
        }
        track.cancel?.();
      }
      if (tracks.length) onCancel?.();
    },
    finish: () => isG ? anim.progress(1) : isA ? anim.seek?.(anim.duration) : anim.finish?.(),
    restart: () => {
      if (!isM) return anim.restart?.();
      for (const track of tracks) {
        pendingTimes?.delete(track);
        legacyEnds?.delete(track);
        if (track.speed < 0) track.speed *= -1;
      }
      anim.cancel?.();
      anim.play?.();
    },
    seek: (t: number) => {
      if (!isM) return isG ? anim.seek(t) : anim.seek?.(t * 1000);
      for (const track of tracks) {
        legacyEnds?.delete(track);
        const driver = driverOf(track);
        // Motion 11 needs an explicit hold to resume a seek from a finished JS track.
        if (driver.state === 'finished' && isJs(driver) && !driver.updateTime) track.pause();
        writeTime(track, t, delayOf(driver));
      }
    },
    get duration() {
      return isG ? (anim.duration?.() ?? 0) : isA ? ((anim.duration || 0) / 1000) : (anim.duration ?? (anim.generator?.duration ?? 0.3));
    },
    get progress() {
      if (isM) return anim.duration ? Math.max(0, Math.min(1, this.currentTime / anim.duration)) : 0;
      return (isG ? anim.progress() : anim.progress) ?? 0;
    },
    get currentTime() { return (isG ? anim.time() : isA ? anim.currentTime / 1000 : tracks.length ? readTime(tracks[0]) : 0) ?? 0; },
    get playState() {
      if (isG) return (!anim.isActive() && anim.progress() >= 1) ? 'finished' : anim.paused() ? 'paused' : anim.isActive() ? 'running' : 'idle';
      if (isA) return anim.completed ? 'finished' : anim.paused ? 'paused' : 'running';
      return tracks.length ? anim.state ?? 'running' : 'idle';
    },
    get finished() { return Promise.resolve(anim.then ? anim.then() : anim.finished || anim); },
    commitStyles: () => anim.commitStyles?.(),
    then: (res, rej) => Promise.resolve(anim.then ? anim.then() : anim.finished || anim).then(res, rej),
  };
}

export function createDeferred(ld: () => Promise<any>, exec: (mod: any) => any): MorphControls {
  let r: any, q: any[] = [];
  const fin = Promise.resolve(ld()).then((m: any) => {
    r = exec(m);
    q.forEach(f => f(r));
    return r.finished;
  });
  const fw = (fn: (c: any) => void) => {
    if (r) fn(r);
    else q.push(fn);
  };
  return {
    play: () => fw(c => c.play()),
    pause: () => fw(c => c.pause()),
    reverse: () => fw(c => c.reverse()),
    cancel: () => fw(c => c.cancel()),
    finish: () => fw(c => c.finish()),
    restart: () => fw(c => c.restart()),
    seek: (t: number) => fw(c => c.seek?.(t)),
    get duration() { return r ? r.duration : 0; },
    get progress() { return r ? r.progress : 0; },
    get currentTime() { return r ? r.currentTime : 0; },
    get playState() { return r ? r.playState : 'idle'; },
    get finished() { return fin; },
    commitStyles: () => fw(c => c.commitStyles?.()),
    then: (res, rej) => fin.then(res, rej),
  };
}

function cubicBezier([x1, y1, x2, y2]: number[]): (progress: number) => number {
  const ax = 1 + 3 * (x1 - x2), bx = 3 * (x2 - 2 * x1), cx = 3 * x1;
  const ay = 1 + 3 * (y1 - y2), by = 3 * (y2 - 2 * y1), cy = 3 * y1;
  // Anime samples the same easing at the same progress for synchronized properties and targets.
  let lastProgress = NaN;
  let lastValue: number;

  return progress => {
    if (progress === 0 || progress === 1) return progress;
    if (progress === lastProgress) return lastValue;
    let min = 0;
    let max = 1;
    for (let i = 0; i < 24; i++) {
      const t = (min + max) / 2;
      const x = (ax * t + bx) * t * t + cx * t;
      if (x === progress) {
        min = max = t;
        break;
      }
      if (x < progress) min = t;
      else max = t;
    }
    const t = (min + max) / 2;
    lastProgress = progress;
    return lastValue = (ay * t + by) * t * t + cy * t;
  };
}

export function toAnimeOptions(props: Record<string, any>, opt?: any, usePropertyTiming = false): Record<string, any> {
  const r = { ...props };
  const ease = opt?.ease || r.ease;
  if (Array.isArray(ease)) r.ease = cubicBezier(ease);
  else if (typeof ease === 'string' && /^ease[A-Z]/.test(ease)) r.ease = ease[4].toLowerCase() + ease.slice(5);
  else if (opt?.ease) r.ease = opt.ease;
  const duration = opt?.duration ?? (usePropertyTiming ? props.duration : undefined);
  const timingDelay = opt?.delay ?? (usePropertyTiming ? props.delay : undefined);
  if (typeof duration === 'number') r.duration = duration * 1000;
  if (typeof timingDelay === 'number') r.delay = timingDelay * 1000;
  if (!opt) return r;
  const delay = opt.delay;
  if (typeof delay === 'function') {
    const delays: number[] = [];
    r.delay = (_target: unknown, index: number, targets: unknown[] | number) =>
      delays[index] ??= delay(index, typeof targets === 'number' ? targets : targets.length) * 1000;
  }
  if (opt.repeat !== undefined) r.loop = opt.repeat;
  if (opt.direction) r.direction = opt.direction;
  if (opt.autoplay !== undefined) r.autoplay = opt.autoplay;
  if (opt.onStart) r.onBegin = opt.onStart;
  if (opt.onUpdate) r.onUpdate = (a: any) => opt.onUpdate(a.progress ?? 0);
  if (opt.onComplete) r.onComplete = opt.onComplete;
  return r;
}

export function toAnimePosition(offset?: string | number): string | number | undefined {
  if (typeof offset === 'number') return offset * 1000;
  return offset?.replace(/([+-]=)([^=]+)$/, (position, operator, value) => {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? `${operator}${seconds * 1000}` : position;
  });
}

const gmap: Record<string, string> = {
  linear: 'none', easeIn: 'power1.in', easeOut: 'power1.out', easeInOut: 'power1.inOut',
  easeInQuad: 'power1.in', easeOutQuad: 'power1.out', easeInOutQuad: 'power1.inOut',
  easeInCubic: 'power2.in', easeOutCubic: 'power2.out', easeInOutCubic: 'power2.inOut',
  easeInQuart: 'power3.in', easeOutQuart: 'power3.out', easeInOutQuart: 'power3.inOut',
  easeOutElastic: 'elastic.out(1, 0.3)', easeOutBounce: 'bounce.out', easeInBack: 'back.in(1.7)', easeOutBack: 'back.out(1.7)',
};

export function toGsapOptions(props: Record<string, any>, opt?: any): Record<string, any> {
  const r = { ...props };
  const ease = opt?.ease || r.ease;
  if (Array.isArray(ease)) r.ease = cubicBezier(ease);
  else if (ease) r.ease = gmap[ease] || ease;
  if (!opt) return r;
  if (opt.duration !== undefined) r.duration = opt.duration;
  const delay = opt.delay;
  if (typeof delay === 'function') {
    r.delay = (index: number, _target: unknown, targets: unknown[]) => delay(index, targets.length);
  } else if (delay !== undefined) r.delay = delay;
  if (opt.repeat !== undefined) r.repeat = opt.repeat === Infinity ? -1 : opt.repeat;
  if (opt.direction === 'alternate' || opt.direction === 'alternate-reverse') r.yoyo = true;
  if (opt.autoplay === false) r.paused = true;
  if (opt.onStart) r.onStart = opt.onStart;
  if (opt.onComplete) r.onComplete = opt.onComplete;
  return r;
}

export function runSpring(motion: any, tgts: any, kf: any, opt?: MorphSpringOptions): MorphControls {
  let seq = false, s1: any = {}, s2: any = {};
  for (const [k, v] of Object.entries(kf)) {
    if (Array.isArray(v) && v.length > 2) { seq = true; s1[k] = [v[0], v[1]]; s2[k] = v[v.length - 1]; }
    else s1[k] = v;
  }
  if (!seq) return wrap(motion.animate(tgts, kf, { ...opt, type: 'spring' }), 'm', motion.frame);

  const c1 = wrap(motion.animate(tgts, s1, { ...opt, type: 'spring' }), 'm', motion.frame);
  let c2: any, cx = false;
  const fin = c1.finished.then(() => cx ? undefined : (c2 = wrap(motion.animate(tgts, s2, { ...opt, type: 'spring' }), 'm', motion.frame), c2.finished));

  return {
    play: () => (c2 || c1).play(),
    pause: () => (c2 || c1).pause(),
    reverse: () => (c2 || c1).reverse(),
    cancel: () => { cx = true; c1.cancel(); c2?.cancel(); },
    finish: () => (c2 || c1).finish(),
    restart: () => { cx = false; c1.cancel(); c2?.cancel(); c1.play(); },
    seek: (t: number) => (c2 || c1).seek(t),
    get duration() { return (c1.duration || 0.3) + (c2?.duration || 0.3); },
    get progress() { return c2 ? 0.5 + c2.progress * 0.5 : c1.progress * 0.5; },
    get currentTime() { return (c2 || c1).currentTime; },
    get playState() { return (c2 || c1).playState; },
    get finished() { return fin; },
    commitStyles: () => { c1.commitStyles(); c2?.commitStyles(); },
    then: (res, rej) => fin.then(res, rej),
  };
}
