import type { MorphControls, MorphSpringOptions } from './types';

let motionModule: any = null;
let motionPromise: Promise<any> | null = null;

let animeModule: any = null;
let animePromise: Promise<any> | null = null;

let gsapModule: any = null;
let gsapPromise: Promise<any> | null = null;

export function loadMotion(): Promise<any> {
  if (motionModule) return Promise.resolve(motionModule);
  if (!motionPromise) {
    motionPromise = import('motion').then((m) => (motionModule = m));
  }
  return motionPromise;
}

export function loadAnime(): Promise<any> {
  if (animeModule) return Promise.resolve(animeModule);
  if (!animePromise) {
    animePromise = import('animejs').then((m) => (animeModule = m));
  }
  return animePromise;
}

export function loadGsap(): Promise<any> {
  if (gsapModule) return Promise.resolve(gsapModule);
  if (!gsapPromise) {
    gsapPromise = Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger').catch(() => null),
      import('gsap/MorphSVGPlugin').catch(() => null),
      import('gsap/DrawSVGPlugin').catch(() => null),
    ]).then(([gsapPkg, stPkg, morphPkg, drawPkg]) => {
      const gsap = gsapPkg.gsap || gsapPkg.default || gsapPkg;
      const plugins: any[] = [];
      if (stPkg?.ScrollTrigger) plugins.push(stPkg.ScrollTrigger);
      if (morphPkg?.MorphSVGPlugin) plugins.push(morphPkg.MorphSVGPlugin);
      if (drawPkg?.DrawSVGPlugin) plugins.push(drawPkg.DrawSVGPlugin);
      if (plugins.length) gsap.registerPlugin(...plugins);

      gsapModule = {
        gsap,
        ScrollTrigger: stPkg?.ScrollTrigger || null,
        MorphSVGPlugin: morphPkg?.MorphSVGPlugin || null,
        DrawSVGPlugin: drawPkg?.DrawSVGPlugin || null,
      };
      return gsapModule;
    });
  }
  return gsapPromise;
}

if (typeof window !== 'undefined') {
  loadMotion().catch(() => {});
  loadAnime().catch(() => {});
  loadGsap().catch(() => {});
}

/**
 * Universal wrapper converting native animation controls (Motion or Anime) to MorphControls.
 */
export function wrapControls(anim: any, isAnime = false): MorphControls {
  return {
    play: () => anim.play?.(),
    pause: () => anim.pause?.(),
    reverse: () => anim.reverse?.(),
    cancel: () => {
      if (isAnime) {
        anim.pause?.();
        if (typeof anim.seek === 'function') anim.seek(0);
      } else {
        anim.cancel?.();
      }
    },
    finish: () => {
      if (isAnime) {
        if (typeof anim.seek === 'function') anim.seek(anim.duration);
      } else {
        anim.finish?.();
      }
    },
    restart: () => {
      if (isAnime) {
        anim.restart?.();
      } else {
        anim.cancel?.();
        anim.play?.();
      }
    },
    seek: (t: number) => {
      if (isAnime) {
        if (typeof anim.seek === 'function') anim.seek(t * 1000);
      } else if (typeof anim.seek === 'function') {
        anim.seek(t);
      } else if ('currentTime' in anim) {
        anim.currentTime = t;
      }
    },
    get progress() {
      return anim.progress ?? 0;
    },
    get currentTime() {
      return isAnime ? (anim.currentTime || 0) / 1000 : (anim.currentTime || 0);
    },
    get finished() {
      return Promise.resolve(anim.finished || anim);
    },
    get playState() {
      if (isAnime) return anim.completed ? 'finished' : anim.paused ? 'paused' : 'running';
      return anim.playState || 'running';
    },
    commitStyles: () => anim.commitStyles?.(),
    then: (res, rej) => Promise.resolve(anim.finished || anim).then(res, rej),
  };
}

/**
 * Wrap a GSAP tween/timeline into MorphControls.
 * GSAP natively uses seconds and 0-1 progress — zero conversion needed.
 */
export function wrapGsapControls(tween: any): MorphControls {
  return {
    play: () => tween.play(),
    pause: () => tween.pause(),
    reverse: () => tween.reverse(),
    restart: () => tween.restart(),
    cancel: () => tween.kill(),
    finish: () => tween.progress(1),
    seek: (t: number) => tween.seek(t),
    get progress() {
      return tween.progress() ?? 0;
    },
    get currentTime() {
      return tween.time() ?? 0;
    },
    get finished() {
      return tween.then ? tween.then() : Promise.resolve();
    },
    get playState() {
      if (!tween.isActive() && tween.progress() >= 1) return 'finished' as const;
      if (tween.paused()) return 'paused' as const;
      if (tween.isActive()) return 'running' as const;
      return 'idle' as const;
    },
    commitStyles: () => {},
    then: (res, rej) => (tween.then ? tween.then() : Promise.resolve()).then(res, rej),
  };
}

/**
 * Deferred controller returned synchronously when dynamic module imports are pending.
 */
export function createDeferred(
  loader: () => Promise<any>,
  execute: (mod: any) => MorphControls
): MorphControls {
  let real: MorphControls | null = null;
  const queue: Array<(c: MorphControls) => void> = [];

  const finished = loader().then((mod) => {
    real = execute(mod);
    while (queue.length > 0) {
      queue.shift()!(real);
    }
    return real.finished;
  });

  const forward = (fn: (c: MorphControls) => void) => {
    if (real) fn(real);
    else queue.push(fn);
  };

  return {
    play: () => forward((c) => c.play()),
    pause: () => forward((c) => c.pause()),
    reverse: () => forward((c) => c.reverse()),
    cancel: () => forward((c) => c.cancel()),
    finish: () => forward((c) => c.finish()),
    restart: () => forward((c) => c.restart()),
    seek: (t: number) => forward((c) => c.seek?.(t)),
    get progress() {
      return real ? real.progress : 0;
    },
    get currentTime() {
      return real ? real.currentTime : 0;
    },
    get playState() {
      return real ? real.playState : 'idle';
    },
    get finished() {
      return finished;
    },
    commitStyles: () => forward((c) => c.commitStyles()),
    then: (res, rej) => finished.then(res, rej),
  };
}

/**
 * Convert standard Morph options to Anime.js v4 parameters.
 */
export function toAnimeOptions(properties: Record<string, any>, options?: any): Record<string, any> {
  const result: Record<string, any> = { ...properties };
  if (!options) return result;

  if (options.duration !== undefined) result.duration = options.duration * 1000;
  if (options.delay !== undefined) result.delay = options.delay * 1000;
  if (options.ease !== undefined) {
    result.ease = Array.isArray(options.ease) ? `cubicBezier(${options.ease.join(',')})` : options.ease;
  }
  if (options.repeat !== undefined) result.loop = options.repeat;
  if (options.direction !== undefined) result.direction = options.direction;
  if (options.autoplay !== undefined) result.autoplay = options.autoplay;
  if (options.onStart) result.onBegin = options.onStart;
  if (options.onUpdate) result.onUpdate = (a: any) => options.onUpdate(a.progress ?? 0);
  if (options.onComplete) result.onComplete = options.onComplete;

  return result;
}

/** Map MorphJS easing names → GSAP easing strings */
const gsapEasingMap: Record<string, string> = {
  linear: 'none',
  easeIn: 'power1.in', easeOut: 'power1.out', easeInOut: 'power1.inOut',
  easeInQuad: 'power2.in', easeOutQuad: 'power2.out', easeInOutQuad: 'power2.inOut',
  easeInCubic: 'power3.in', easeOutCubic: 'power3.out', easeInOutCubic: 'power3.inOut',
  easeInQuart: 'power4.in', easeOutQuart: 'power4.out', easeInOutQuart: 'power4.inOut',
  easeOutElastic: 'elastic.out(1, 0.3)', easeOutBounce: 'bounce.out',
  easeInBack: 'back.in(1.7)', easeOutBack: 'back.out(1.7)',
};

/**
 * Convert standard Morph options to GSAP vars.
 * GSAP uses seconds natively — zero conversion overhead.
 */
export function toGsapOptions(properties: Record<string, any>, options?: any): Record<string, any> {
  const vars: Record<string, any> = { ...properties };
  if (!options) return vars;

  if (options.duration !== undefined) vars.duration = options.duration;
  if (options.delay !== undefined) vars.delay = options.delay;
  if (options.ease !== undefined) {
    const e = options.ease;
    vars.ease = typeof e === 'string' && gsapEasingMap[e] ? gsapEasingMap[e] : e;
  }
  if (options.repeat !== undefined) vars.repeat = options.repeat === Infinity ? -1 : options.repeat;
  if (options.direction === 'alternate' || options.direction === 'alternate-reverse') vars.yoyo = true;
  if (options.autoplay === false) vars.paused = true;
  if (options.onStart) vars.onStart = options.onStart;
  if (options.onComplete) vars.onComplete = options.onComplete;

  return vars;
}

/**
 * Handle spring animations via Motion with multi-keyframe sequence support.
 */
export function runSpring(
  motion: any,
  targets: any,
  keyframes: any,
  options?: MorphSpringOptions
): MorphControls {
  let hasSequence = false;
  const s1: Record<string, any> = {};
  const s2: Record<string, any> = {};

  for (const [k, v] of Object.entries(keyframes)) {
    if (Array.isArray(v) && v.length > 2) {
      hasSequence = true;
      s1[k] = v[1];
      s2[k] = v[v.length - 1];
    } else {
      s1[k] = v;
    }
  }

  if (hasSequence) {
    const c1 = wrapControls(motion.animate(targets, s1, { ...options, type: 'spring' }), false);
    let c2: MorphControls | null = null;
    let isCancelled = false;

    const finished = c1.finished.then(() => {
      if (isCancelled) return;
      c2 = wrapControls(motion.animate(targets, s2, { ...options, type: 'spring' }), false);
      return c2.finished;
    });

    return {
      play: () => (c2 || c1).play(),
      pause: () => (c2 || c1).pause(),
      reverse: () => (c2 || c1).reverse(),
      cancel: () => {
        isCancelled = true;
        c1.cancel();
        if (c2) c2.cancel();
      },
      finish: () => {
        if (c2) c2.finish();
        else c1.finish();
      },
      restart: () => {
        isCancelled = false;
        c1.cancel();
        if (c2) c2.cancel();
        c1.play();
      },
      seek: (t: number) => {
        if (c2?.seek) c2.seek(t);
        else if (c1?.seek) c1.seek(t);
      },
      get progress() {
        return c2 ? 0.5 + c2.progress * 0.5 : c1.progress * 0.5;
      },
      get currentTime() {
        return c2 ? c2.currentTime : c1.currentTime;
      },
      get playState() {
        return c2 ? c2.playState : c1.playState;
      },
      get finished() {
        return finished;
      },
      commitStyles: () => {
        c1.commitStyles();
        c2?.commitStyles();
      },
      then: (res, rej) => finished.then(res, rej),
    };
  }

  return wrapControls(motion.animate(targets, keyframes, { ...options, type: 'spring' }), false);
}
