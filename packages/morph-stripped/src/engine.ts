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

export function wrap(anim: any, type: 'm'|'a'|'g'): MorphControls {
  const isA = type === 'a', isG = type === 'g';
  return {
    play: () => anim.play?.(),
    pause: () => anim.pause?.(),
    reverse: () => anim.reverse?.(),
    cancel: () => isG ? anim.kill() : isA ? (anim.pause?.(), anim.seek?.(0)) : anim.cancel?.(),
    finish: () => isG ? anim.progress(1) : isA ? anim.seek?.(anim.duration) : anim.finish?.(),
    restart: () => (isG || isA) ? anim.restart?.() : (anim.cancel?.(), anim.play?.()),
    seek: (t: number) => isG ? anim.seek(t) : isA ? anim.seek?.(t * 1000) : (anim.seek ? anim.seek(t) : anim.currentTime = t),
    get duration() {
      return isG ? (anim.duration?.() ?? 0) : isA ? ((anim.duration || 0) / 1000) : (anim.duration ?? (anim.generator?.duration ?? 0.3));
    },
    get progress() { return (isG ? anim.progress() : anim.progress) ?? 0; },
    get currentTime() { return (isG ? anim.time() : isA ? anim.currentTime / 1000 : anim.currentTime) ?? 0; },
    get playState() {
      if (isG) return (!anim.isActive() && anim.progress() >= 1) ? 'finished' : anim.paused() ? 'paused' : anim.isActive() ? 'running' : 'idle';
      if (isA) return anim.completed ? 'finished' : anim.paused ? 'paused' : 'running';
      return anim.playState || 'running';
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

export function toAnimeOptions(props: Record<string, any>, opt?: any): Record<string, any> {
  const r = { ...props };
  if (!opt) return r;
  if (opt.duration !== undefined) r.duration = opt.duration * 1000;
  if (opt.delay !== undefined) r.delay = opt.delay * 1000;
  if (opt.ease) r.ease = Array.isArray(opt.ease) ? `cubicBezier(${opt.ease.join(',')})` : opt.ease;
  if (opt.repeat !== undefined) r.loop = opt.repeat;
  if (opt.direction) r.direction = opt.direction;
  if (opt.autoplay !== undefined) r.autoplay = opt.autoplay;
  if (opt.onStart) r.onBegin = opt.onStart;
  if (opt.onUpdate) r.onUpdate = (a: any) => opt.onUpdate(a.progress ?? 0);
  if (opt.onComplete) r.onComplete = opt.onComplete;
  return r;
}

const gmap: Record<string, string> = {
  linear: 'none', easeIn: 'power1.in', easeOut: 'power1.out', easeInOut: 'power1.inOut',
  easeInQuad: 'power2.in', easeOutQuad: 'power2.out', easeInOutQuad: 'power2.inOut',
  easeInCubic: 'power3.in', easeOutCubic: 'power3.out', easeInOutCubic: 'power3.inOut',
  easeInQuart: 'power4.in', easeOutQuart: 'power4.out', easeInOutQuart: 'power4.inOut',
  easeOutElastic: 'elastic.out(1, 0.3)', easeOutBounce: 'bounce.out', easeInBack: 'back.in(1.7)', easeOutBack: 'back.out(1.7)',
};

export function toGsapOptions(props: Record<string, any>, opt?: any): Record<string, any> {
  const r = { ...props };
  if (!opt) return r;
  if (opt.duration !== undefined) r.duration = opt.duration;
  if (opt.delay !== undefined) r.delay = opt.delay;
  if (opt.ease) r.ease = gmap[opt.ease as string] || opt.ease;
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
    if (Array.isArray(v) && v.length > 2) { seq = true; s1[k] = v[1]; s2[k] = v[v.length - 1]; }
    else s1[k] = v;
  }
  if (!seq) return wrap(motion.animate(tgts, kf, { ...opt, type: 'spring' }), 'm');

  const c1 = wrap(motion.animate(tgts, s1, { ...opt, type: 'spring' }), 'm');
  let c2: any, cx = false;
  const fin = c1.finished.then(() => cx ? undefined : (c2 = wrap(motion.animate(tgts, s2, { ...opt, type: 'spring' }), 'm'), c2.finished));

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
