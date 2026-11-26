import type {
  CubicBezier,
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
import { notifyControlsCanceled } from '../utils/controls';
import { createDeferredControls, seekControlsProgress } from '../utils/deferred-controls';

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
export function wrapGsapControls(tween: any, kill = () => tween.kill()): MorphControls {
  const controls: MorphControls = {
    play: () => tween.play(),
    pause: () => tween.pause(),
    reverse: () => tween.reverse(),
    restart: () => tween.restart(),
    cancel: () => {
      kill();
      notifyControlsCanceled(controls);
    },
    finish: () => {
      tween.progress(1);
    },
    seek: (time: number) => {
      tween.seek(time);
    },
    get duration() {
      return tween.duration();
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
  return controls;
}

function toScrollTriggerOffset(offset: string | number, horizontal: boolean): string | (() => string) {
  const [target, scroller] = typeof offset === 'number'
    ? [String(offset), String(offset)]
    : offset.trim().split(/\s+/);
  const edges = [target, scroller ?? (['start', 'center', 'end'].includes(target) ? target : '0')];
  const position = () => edges.map(edge => {
    if (edge === 'start') return horizontal ? 'left' : 'top';
    if (edge === 'end') return horizontal ? 'right' : 'bottom';
    if (edge && Number.isFinite(Number(edge))) return `${Number(edge) * 100}%`;
    if (typeof document !== 'undefined') {
      if (edge.endsWith('vw')) return `${parseFloat(edge) * document.documentElement.clientWidth / 100}px`;
      if (edge.endsWith('vh')) return `${parseFloat(edge) * document.documentElement.clientHeight / 100}px`;
    }
    return edge;
  }).join(' ');
  return edges.some(edge => /v[wh]$/.test(edge)) ? position : position();
}

/**
 * Convert MorphAnimationOptions to GSAP vars object.
 * GSAP uses seconds natively — no ms conversion needed (unlike Anime.js).
 */
function toGsapVars(properties: Record<string, any>, options?: MorphAnimationOptions): Record<string, any> {
  const vars: Record<string, any> = { ...properties };
  const ease = options?.ease ?? (Array.isArray(properties.ease) ? properties.ease as CubicBezier : undefined);

  if (options?.duration !== undefined) vars.duration = options.duration;
  const delay = options?.delay;
  if (typeof delay === 'function') {
    vars.delay = (index: number, _target: unknown, targets: unknown[]) => delay(index, targets.length);
  } else if (delay !== undefined) {
    vars.delay = delay;
  }
  if (ease !== undefined) vars.ease = toGsapEasing(ease);
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
    const from: Record<string, any> = {};
    const toProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (key !== 'keyframes' && key !== 'ease' && Array.isArray(value) && value.length === 2) {
        from[key] = value[0];
        toProps[key] = value[1];
      } else {
        toProps[key] = value;
      }
    }
    const vars = toGsapVars(toProps, options);
    return afterPlugins(pendingPlugins(vars), () =>
      wrapGsapControls(Object.keys(from).length ? gsap.fromTo(targets, from, vars) : gsap.to(targets, vars))
    );
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

    const doc = typeof document === 'undefined' ? undefined : document;
    const root = doc?.documentElement;
    const container = options?.container;
    const triggerTarget = options?.target ?? root;
    let pin = options?.pin ?? false;
    if (pin) {
      const pinned = pin === true ? triggerTarget : typeof pin === 'string' ? gsap.utils.toArray(pin)[0] : pin;
      if (!pinned?.parentNode || pinned === root || pinned === pinned.ownerDocument?.body || pinned === container) {
        console.warn('[MorphJS] Scroll pinning requires a pinnable element; ignoring pin.');
        pin = false;
      }
    }
    const horizontal = options?.axis === 'x';
    const leadingEdge = horizontal ? 'left' : 'top';
    const viewportScroller = !container || container === root || container === doc?.body;
    const pinEnd = horizontal && viewportScroller && root
      ? () => `clamp(left left-=${root.clientWidth}px)`
      : `clamp(${leadingEdge} ${leadingEdge}-=100%)`;
    const [start, end] = options?.offset ?? [];
    const fullScrollerRange = !options?.target && !pin && !options?.offset;
    const scrollerRange = fullScrollerRange && container && !viewportScroller
      ? () => Math.max(1, horizontal
        ? container.scrollWidth - container.clientWidth
        : container.scrollHeight - container.clientHeight)
      : undefined;
    const vars = {
      trigger: triggerTarget,
      scroller: container,
      horizontal,
      start: fullScrollerRange ? 0
        : start === undefined ? `${leadingEdge} ${leadingEdge}` : toScrollTriggerOffset(start, horizontal),
      end: fullScrollerRange ? scrollerRange ?? 'max' : end === undefined
        ? (pin ? pinEnd : horizontal ? 'right right' : 'bottom bottom')
        : toScrollTriggerOffset(end, horizontal),
      pin,
      ...(scrollerRange && {
        onRefresh: (self: { end: number; setPositions(start: number, end: number): void }) => {
          const max = scrollerRange();
          if (self.end !== max) self.setPositions(0, max);
        },
      }),
    };

    if (typeof animationOrCallback === 'function') {
      const trigger = ScrollTrigger.create({
        ...vars,
        scrub: options?.scrub ?? false,
        onUpdate: (self: { progress: number }) => animationOrCallback(self.progress),
      });

      const controls: MorphControls = {
        play: () => {},
        pause: () => {},
        reverse: () => {},
        cancel: () => {
          trigger.kill();
          notifyControlsCanceled(controls);
        },
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
      return controls;
    }

    let attached = false;
    const playhead = { progress: 0 };
    const update = () => seekControlsProgress(animationOrCallback, playhead.progress);
    const tween = gsap.to(playhead, {
      progress: 1,
      duration: 1,
      ease: 'none',
      paused: true,
      onUpdate: () => { if (attached) update(); },
    });
    let trigger: { kill(): void };
    try {
      trigger = ScrollTrigger.create({ ...vars, scrub: options?.scrub ?? true, animation: tween });
    } catch (err) {
      tween.kill();
      throw err;
    }
    animationOrCallback.pause();
    attached = true;
    update();
    return wrapGsapControls(tween, () => trigger.kill());
  },

  svg(
    targets: MorphTargets,
    properties: Record<string, any>,
    options?: MorphSvgOptions
  ): MorphControls {
    const mod = getGsapSync();
    const dashoffset = properties.strokeDashoffset;
    const draw = Array.isArray(dashoffset) && dashoffset.length === 2 && dashoffset[0] !== undefined;
    const loads = pendingPlugins({ morphSVG: properties.d, drawSVG: draw ? true : undefined });
    return afterPlugins(loads, () => {
      const { gsap, MorphSVGPlugin, DrawSVGPlugin } = mod;
      const from: Record<string, any> = {};
      const to = toGsapVars({}, options);
      const fromAttrs: Record<string, any> = {};
      const toAttrs: Record<string, any> = {};
      const reversed = options?.direction === 'reverse' || options?.direction === 'alternate-reverse';

      for (const [name, value] of Object.entries(properties)) {
        let [start, end] = Array.isArray(value) && value.length === 2 ? value : [undefined, value];
        if (name === 'strokeDashoffset') {
          if (DrawSVGPlugin && start !== undefined) {
            from.drawSVG = reversed ? '100%' : '0%';
            to.drawSVG = reversed ? '0%' : '100%';
          } else {
            if (start !== undefined) from.strokeDashoffset = start;
            to.strokeDashoffset = end;
          }
        } else {
          if (reversed && start !== undefined) [start, end] = [end, start];
          if (start !== undefined) fromAttrs[name] = start;
          if (name === 'd' && MorphSVGPlugin) {
            to.morphSVG = { shape: end };
          } else {
            toAttrs[name] = end;
          }
        }
      }

      if (Object.keys(fromAttrs).length) from.attr = fromAttrs;
      if (Object.keys(toAttrs).length) to.attr = toAttrs;
      return wrapGsapControls(Object.keys(from).length ? gsap.fromTo(targets, from, to) : gsap.to(targets, to));
    });
  },
};
