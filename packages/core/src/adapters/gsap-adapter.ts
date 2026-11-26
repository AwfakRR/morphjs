import type {
  IAnimationAdapter,
  MorphAnimationOptions,
  MorphControls,
  MorphTimeline,
  MorphStaggerOptions,
  MorphSvgOptions,
  MorphScrollOptions,
  MorphTargets,
  TimelineSegment,
  TimelineOptions,
} from '../types';
import { toGsapEasing } from '../easing/easing';

/** Cached GSAP module and plugins */
let gsapModule: any = null;
let gsapLoadPromise: Promise<any> | null = null;

export async function ensureGsap(): Promise<any> {
  if (gsapModule) return gsapModule;
  if (!gsapLoadPromise) {
    gsapLoadPromise = Promise.all([
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
    }).catch(() => {
      throw new Error('[MorphJS] "gsap" package is required. Install it: pnpm add gsap');
    });
  }
  return gsapLoadPromise;
}

export function getGsapSync(): any {
  if (!gsapModule) {
    throw new Error('[MorphJS] GSAP adapter not initialized. Call await ensureGsap() first.');
  }
  return gsapModule;
}

/**
 * Wrap a GSAP tween/timeline instance into MorphControls.
 * GSAP natively uses seconds and 0-1 progress — zero conversion overhead.
 */
export function wrapGsapControls(tween: any): MorphControls {
  return {
    play: () => tween.play(),
    pause: () => tween.pause(),
    reverse: () => tween.reverse(),
    restart: () => tween.restart(),
    cancel: () => {
      tween.kill();
    },
    finish: () => {
      tween.progress(1);
    },
    seek: (time: number) => {
      tween.seek(time);
    },
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
    then: (onfulfilled, onrejected) => {
      return (tween.then ? tween.then() : Promise.resolve()).then(onfulfilled, onrejected);
    },
  };
}

/**
 * Convert MorphAnimationOptions to GSAP vars object.
 * GSAP uses seconds natively — no ms conversion needed (unlike Anime.js).
 */
function toGsapVars(properties: Record<string, any>, options?: MorphAnimationOptions): Record<string, any> {
  const vars: Record<string, any> = { ...properties };

  if (options?.duration !== undefined) vars.duration = options.duration;
  if (options?.delay !== undefined) vars.delay = options.delay;
  if (options?.ease !== undefined) vars.ease = toGsapEasing(options.ease);
  if (options?.repeat !== undefined) vars.repeat = options.repeat === Infinity ? -1 : options.repeat;
  if (options?.direction === 'alternate' || options?.direction === 'alternate-reverse') vars.yoyo = true;
  if (options?.direction === 'reverse' || options?.direction === 'alternate-reverse') {
    // GSAP doesn't have a 'direction' param; use reversed() or handle per-case
  }
  if (options?.autoplay === false) vars.paused = true;
  if (options?.onStart) vars.onStart = options.onStart;
  if (options?.onUpdate) vars.onUpdate = function () { options.onUpdate!(this.progress()); };
  if (options?.onComplete) vars.onComplete = options.onComplete;

  return vars;
}

// Auto-preload GSAP in browser environments
if (typeof window !== 'undefined') {
  ensureGsap().catch(() => {});
}

/**
 * GSAP v3 adapter — handles tweens, timelines, stagger, scroll (ScrollTrigger), and SVG.
 */
export const gsapAdapter: IAnimationAdapter = {
  name: 'gsap',
  capabilities: ['tween', 'timeline', 'stagger', 'scroll', 'svg'],
  ensure: ensureGsap,

  animate(
    targets: MorphTargets,
    properties: Record<string, any>,
    options?: MorphAnimationOptions
  ): MorphControls {
    const { gsap } = getGsapSync();
    const vars = toGsapVars(properties, options);
    const tween = gsap.to(targets, vars);
    return wrapGsapControls(tween);
  },

  timeline(
    segments: TimelineSegment[],
    options?: TimelineOptions
  ): MorphTimeline {
    const { gsap } = getGsapSync();

    const defaults: Record<string, any> = {};
    if (options?.defaults?.duration !== undefined) defaults.duration = options.defaults.duration;
    if (options?.defaults?.ease !== undefined) defaults.ease = toGsapEasing(options.defaults.ease);

    const tl = gsap.timeline({
      paused: options?.autoplay === false,
      defaults: Object.keys(defaults).length ? defaults : undefined,
    });

    for (const seg of segments) {
      const vars = toGsapVars(seg.properties, seg.options);
      tl.to(seg.targets, vars, seg.offset);
    }

    const controls = wrapGsapControls(tl);

    return {
      ...controls,
      get duration() {
        return tl.duration() || 0;
      },
      add(addTargets, addProps, offset?) {
        const addVars = toGsapVars(addProps);
        tl.to(addTargets, addVars, offset);
        return this;
      },
      label(name, offset?) {
        tl.addLabel(name, offset);
        return this;
      },
      addPause(offset?, callback?) {
        tl.addPause(offset, callback);
        return this;
      },
    };
  },

  stagger(value: number, options?: MorphStaggerOptions): any {
    // GSAP stagger uses seconds natively — direct pass-through
    const staggerConfig: any = { each: value };
    if (options?.from !== undefined) staggerConfig.from = options.from;
    if (options?.grid) staggerConfig.grid = options.grid;
    if (options?.ease) staggerConfig.ease = toGsapEasing(options.ease);
    return staggerConfig;
  },

  scroll(
    animationOrCallback: MorphControls | ((progress: number) => void),
    options?: MorphScrollOptions
  ): MorphControls {
    const { gsap, ScrollTrigger } = getGsapSync();

    if (!ScrollTrigger) {
      throw new Error('[MorphJS] ScrollTrigger plugin not available. Falling back.');
    }

    if (typeof animationOrCallback === 'function') {
      const trigger = ScrollTrigger.create({
        trigger: options?.target || document.documentElement,
        scroller: options?.container,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self: any) => animationOrCallback(self.progress),
      });

      return {
        play: () => {},
        pause: () => {},
        reverse: () => {},
        cancel: () => trigger.kill(),
        finish: () => {},
        restart: () => {},
        seek: () => {},
        progress: 0,
        currentTime: 0,
        playState: 'running',
        finished: Promise.resolve(),
        then: (fn) => Promise.resolve().then(fn),
        commitStyles: () => {},
      };
    }

    // For animation controls, create a scrubbed tween
    const tween = gsap.to({}, {
      scrollTrigger: {
        trigger: options?.target || document.documentElement,
        scroller: options?.container,
        scrub: true,
        start: 'top top',
        end: 'bottom bottom',
      },
    });

    return wrapGsapControls(tween);
  },

  svg(
    targets: MorphTargets,
    properties: Record<string, any>,
    options?: MorphSvgOptions
  ): MorphControls {
    const { gsap, MorphSVGPlugin, DrawSVGPlugin } = getGsapSync();
    const vars = toGsapVars({}, options);

    // SVG morph: use MorphSVGPlugin if available
    if (properties.d && MorphSVGPlugin) {
      const toPath = Array.isArray(properties.d) ? properties.d[1] : properties.d;
      vars.morphSVG = { shape: toPath };
      return wrapGsapControls(gsap.to(targets, vars));
    }

    // SVG draw: use DrawSVGPlugin if available
    if (properties.strokeDashoffset !== undefined && DrawSVGPlugin) {
      const reversed = options?.direction === 'reverse';
      return wrapGsapControls(gsap.fromTo(targets,
        { drawSVG: reversed ? '100%' : '0%' },
        { ...vars, drawSVG: reversed ? '0%' : '100%' },
      ));
    }

    // SVG attributes: use GSAP's built-in attr plugin
    vars.attr = properties;
    return wrapGsapControls(gsap.to(targets, vars));
  },
};
