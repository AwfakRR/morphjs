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
import { createDeferredControls } from '../utils/deferred-controls';

/** Cached GSAP module */
let gsapModule: any = null;
let gsapLoadPromise: Promise<any> | null = null;

export async function ensureGsap(): Promise<any> {
  if (gsapModule) return gsapModule;
  if (!gsapLoadPromise) {
    gsapLoadPromise = import('gsap').then(pkg => {
      gsapModule = { gsap: pkg.gsap || pkg.default || pkg };
      return gsapModule;
    }).catch(() => {
      throw new Error('[MorphJS] "gsap" package is required. Install it: pnpm add gsap');
    });
  }
  return gsapLoadPromise;
}

function gsapPlugin<K extends string>(name: K, importer: () => Promise<Record<K, any>>) {
  let pending: Promise<void>;
  return () => (pending ||= Promise.all([ensureGsap(), importer().catch(() => null)]).then(([mod, pkg]) => {
    const plugin = pkg?.[name] ?? null;
    if (plugin) mod.gsap.registerPlugin(plugin);
    mod[name] = plugin;
  }));
}

export const ensureScrollTrigger = gsapPlugin('ScrollTrigger', () => import('gsap/ScrollTrigger'));
const ensureMorphSVG = gsapPlugin('MorphSVGPlugin', () => import('gsap/MorphSVGPlugin'));
const ensureDrawSVG = gsapPlugin('DrawSVGPlugin', () => import('gsap/DrawSVGPlugin'));

function pendingPlugins(properties: Record<string, any>): Promise<void>[] {
  const mod = getGsapSync();
  return [
    properties.scrollTrigger !== undefined && mod.ScrollTrigger === undefined && ensureScrollTrigger(),
    properties.morphSVG !== undefined && mod.MorphSVGPlugin === undefined && ensureMorphSVG(),
    properties.drawSVG !== undefined && mod.DrawSVGPlugin === undefined && ensureDrawSVG(),
  ].filter((load): load is Promise<void> => !!load);
}

function afterPlugins(loads: Promise<void>[], run: () => MorphControls): MorphControls {
  if (!loads.length) return run();
  const deferred = createDeferredControls();
  void Promise.all(loads).then(() => deferred.resolve(run())).catch(deferred.reject);
  return deferred.controls;
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
  const delay = options?.delay;
  if (typeof delay === 'function') {
    vars.delay = (index: number, _target: unknown, targets: unknown[]) => delay(index, targets.length);
  } else if (delay !== undefined) {
    vars.delay = delay;
  }
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
    return afterPlugins(pendingPlugins(vars), () => wrapGsapControls(gsap.to(targets, vars)));
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

    let pending: Promise<void> | undefined;
    const enqueue = (run: () => void, loads: Promise<void>[] = []) => {
      if (!pending && !loads.length) {
        run();
        return;
      }
      const next = Promise.all([pending, ...loads]).then(run);
      pending = next;
      void next.then(() => { if (pending === next) pending = undefined; }, () => {});
    };
    const add = (targets: MorphTargets, vars: Record<string, any>, offset?: string | number) => {
      enqueue(() => { tl.to(targets, vars, offset); }, pendingPlugins(vars));
    };
    segments.forEach(seg => add(seg.targets, toGsapVars(seg.properties, seg.options), seg.offset));

    const wrapped = wrapGsapControls(tl);
    const controls = pending
      ? afterPlugins([pending], () => {
          if (options?.autoplay !== false) tl.play();
          return wrapped;
        })
      : wrapped;
    if (pending) tl.pause();

    const timeline = Object.assign(controls, {
      add(addTargets: MorphTargets, addProps: Record<string, any>, offset?: number | string) {
        add(addTargets, toGsapVars(addProps), offset);
        return timeline;
      },
      label(name: string, offset?: number | string) {
        enqueue(() => { tl.addLabel(name, offset); });
        return timeline;
      },
      addPause(offset?: number | string, callback?: () => void) {
        enqueue(() => { tl.addPause(offset, callback); });
        return timeline;
      },
    }) as MorphTimeline;
    Object.defineProperty(timeline, 'duration', { get: () => tl.duration() || 0 });
    return timeline;
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
    const mod = getGsapSync();
    const morph = properties.d;
    const draw = properties.strokeDashoffset !== undefined;
    const loads = pendingPlugins({ morphSVG: morph || undefined, drawSVG: draw ? true : undefined });
    return afterPlugins(loads, () => {
      const { gsap, MorphSVGPlugin, DrawSVGPlugin } = mod;
      const vars = toGsapVars({}, options);

      if (morph && MorphSVGPlugin) {
        vars.morphSVG = { shape: Array.isArray(morph) ? morph[1] : morph };
        return wrapGsapControls(gsap.to(targets, vars));
      }

      if (draw && DrawSVGPlugin) {
        vars.drawSVG = '100%';
        return wrapGsapControls(gsap.from(targets, { drawSVG: 0, ...vars }));
      }

      vars.attr = properties;
      return wrapGsapControls(gsap.to(targets, vars));
    });
  },
};
