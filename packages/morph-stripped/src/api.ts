import type {
  MorphTargets,
  MorphAnimationOptions,
  MorphSpringOptions,
  MorphStaggerOptions,
  MorphScrollOptions,
  MorphGestureOptions,
  MorphSvgOptions,
  TimelineOptions,
  MorphControls,
  MorphTimeline,
} from './types';
import {
  loadMotion,
  loadAnime,
  loadGsap,
  wrapControls,
  wrapGsapControls,
  createDeferred,
  toAnimeOptions,
  toGsapOptions,
  runSpring,
} from './engine';

export type AnimateArg = MorphAnimationOptions | number;

/**
 * Animate targets with CSS or SVG properties.
 * Routes to the best engine automatically:
 *   - Motion.js for CSS tweens (WAAPI, compositor thread)
 *   - Anime.js for repeat/loop animations
 *   - GSAP when explicitly requested via engine option
 */
export function animate(
  targets: MorphTargets,
  properties: Record<string, any>,
  options?: AnimateArg
): MorphControls {
  const opts: any = typeof options === 'number' ? { duration: options } : options || {};

  // Explicit engine override
  if (opts.engine === 'gsap') {
    return createDeferred(loadGsap, ({ gsap }) => {
      return wrapGsapControls(gsap.to(targets, toGsapOptions(properties, opts)));
    });
  }
  if (opts.engine === 'anime') {
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(anime.animate(targets, toAnimeOptions(properties, opts)), true);
    });
  }

  // SVG path morphing or stroke drawing → Anime.js (fallback; SVG functions use GSAP directly)
  if ('d' in properties || 'strokeDashoffset' in properties || opts.repeat !== undefined) {
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(anime.animate(targets, toAnimeOptions(properties, opts)), true);
    });
  }

  // Default: Motion.js for CSS/transform tweens (WAAPI)
  return createDeferred(loadMotion, (motion) => {
    return wrapControls(motion.animate(targets, properties, opts as any), false);
  });
}

/**
 * Animate with spring physics. Always uses Motion.js (analytical spring solver).
 */
export function spring(
  targets: MorphTargets,
  properties: Record<string, any>,
  options?: MorphSpringOptions
): MorphControls {
  return createDeferred(loadMotion, (motion) => {
    return runSpring(motion, targets, properties, options);
  });
}

/**
 * Create a sequence timeline with fluent .add() chaining.
 * Default engine: GSAP (industry-best timeline with labels, position params, nesting).
 * Fallback: Anime.js if GSAP unavailable.
 */
export function timeline(options?: TimelineOptions): MorphTimeline {
  const segments: Array<{ targets: any; props: any; offset?: any }> = [];
  let realTl: any = null;
  let engine: 'gsap' | 'anime' = 'gsap';

  const buildGsap = ({ gsap }: any) => {
    const defaults: Record<string, any> = {};
    if (options?.defaults?.duration !== undefined) defaults.duration = options.defaults.duration;
    if (options?.defaults?.ease !== undefined) {
      const e = options.defaults.ease;
      defaults.ease = typeof e === 'string' ? e : e;
    }

    const tl = gsap.timeline({
      paused: options?.autoplay === false,
      defaults: Object.keys(defaults).length ? defaults : undefined,
    });

    for (const s of segments) {
      tl.to(s.targets, toGsapOptions(s.props), s.offset);
    }
    realTl = tl;
    return wrapGsapControls(tl);
  };

  const buildAnime = (anime: any) => {
    const tl = anime.createTimeline({
      autoplay: options?.autoplay ?? true,
      defaults: options?.defaults ? toAnimeOptions(options.defaults) : undefined,
    });
    for (const s of segments) {
      tl.add(s.targets, toAnimeOptions(s.props), s.offset);
    }
    realTl = tl;
    return wrapControls(tl, true);
  };

  // Try GSAP first, fall back to Anime.js
  const deferred = createDeferred(
    () => loadGsap().catch(() => {
      engine = 'anime';
      return loadAnime();
    }),
    (mod) => engine === 'gsap' ? buildGsap(mod) : buildAnime(mod)
  );

  const tlObject: MorphTimeline = Object.assign(deferred, {
    add(targets: any, props: any, offset?: any) {
      if (realTl) {
        if (engine === 'gsap') {
          realTl.to(targets, toGsapOptions(props), offset);
        } else {
          realTl.add(targets, toAnimeOptions(props), offset);
        }
      } else {
        segments.push({ targets, props, offset });
      }
      return tlObject;
    },
    label(name: string, offset?: any) {
      if (realTl && engine === 'gsap') {
        realTl.addLabel(name, offset);
      }
      return tlObject;
    },
    addPause(offset?: any, cb?: any) {
      if (realTl && engine === 'gsap') {
        realTl.addPause(offset, cb);
      }
      return tlObject;
    },
    get duration() {
      if (!realTl) return 0;
      return engine === 'gsap' ? (realTl.duration() || 0) : (realTl.duration || 0) / 1000;
    },
  });

  if (options?.autoplay !== false) {
    Promise.resolve().then(() => tlObject.play());
  }

  return tlObject;
}

/**
 * Stagger animation offsets across multiple elements.
 */
export function stagger(value: number, options?: MorphStaggerOptions): any {
  return (index: number, total: number = 1): number => {
    let effectiveIndex = index;

    if (options?.from === 'last') {
      effectiveIndex = total - 1 - index;
    } else if (options?.from === 'center') {
      const center = (total - 1) / 2;
      effectiveIndex = Math.abs(index - center);
    } else if (options?.from === 'random') {
      effectiveIndex = Math.random() * total;
    } else if (typeof options?.from === 'number') {
      effectiveIndex = Math.abs(index - options.from);
    }

    const start = typeof options?.start === 'number' ? options.start : 0;
    return start + effectiveIndex * value;
  };
}

/**
 * Scroll-linked animation or scroll observer.
 * Default engine: GSAP ScrollTrigger (pinning, scrub, velocity).
 * Fallback: Motion.js scroll tracking.
 */
export function scroll(
  animationOrCallback: MorphControls | ((progress: number) => void),
  options?: MorphScrollOptions
): MorphControls {
  // Try GSAP ScrollTrigger first
  return createDeferred(
    () => loadGsap().catch(() => loadMotion()),
    (mod) => {
      // GSAP path
      if (mod.gsap && mod.ScrollTrigger) {
        const { gsap, ScrollTrigger } = mod;

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
            playState: 'running' as const,
            finished: Promise.resolve(),
            then: (fn: any) => Promise.resolve().then(fn),
            commitStyles: () => {},
          };
        }

        // Scrub-linked animation
        return wrapGsapControls(gsap.to({}, {
          scrollTrigger: {
            trigger: options?.target || document.documentElement,
            scroller: options?.container,
            scrub: true,
            start: 'top top',
            end: 'bottom bottom',
          },
        }));
      }

      // Motion.js fallback
      const motion = mod;
      const res = motion.scroll(animationOrCallback, options);
      if (typeof animationOrCallback === 'function') {
        return {
          play: () => {},
          pause: () => {},
          reverse: () => {},
          cancel: () => { if (typeof res === 'function') res(); },
          finish: () => {},
          restart: () => {},
          seek: () => {},
          progress: 0,
          currentTime: 0,
          playState: 'running' as const,
          finished: Promise.resolve(),
          then: (fn: any) => Promise.resolve().then(fn),
          commitStyles: () => {},
        };
      }
      return animationOrCallback;
    }
  );
}

/**
 * Gesture bindings (drag, hover, press). Returns cleanup function.
 * Uses Motion.js for hover/press, native pointer events for drag.
 */
export function gesture(
  targets: MorphTargets,
  options?: MorphGestureOptions
): () => void {
  if (typeof window === 'undefined') return () => {};

  const cleanups: Array<() => void> = [];
  const elements: any[] = typeof targets === 'string'
    ? Array.from(document.querySelectorAll(targets))
    : Array.isArray(targets) || targets instanceof NodeList
      ? Array.from(targets as any)
      : [targets];

  // Motion hover & press
  if (options?.hover || options?.press) {
    loadMotion().then((motion) => {
      if (options.hover && motion.hover) {
        const c = motion.hover(targets, {
          onHoverStart: options.onHoverStart,
          onHoverEnd: options.onHoverEnd,
        });
        if (typeof c === 'function') cleanups.push(c);
      }
      if (options.press && motion.press) {
        const c = motion.press(targets, {
          onPressStart: options.onPressStart,
          onPressEnd: options.onPressEnd,
        });
        if (typeof c === 'function') cleanups.push(c);
      }
    });
  }

  // Native drag fallback
  if (options?.drag) {
    for (const el of elements) {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;

      let active = false;
      let ox = 0, oy = 0, px = 0, py = 0;

      const down = (e: PointerEvent) => {
        active = true;
        ox = px = e.clientX;
        oy = py = e.clientY;
        el.setPointerCapture?.(e.pointerId);
        options.onDragStart?.(e, { point: {x: e.clientX, y: e.clientY}, delta: {x: 0, y: 0}, offset: {x: 0, y: 0}, velocity: {x: 0, y: 0} });
      };

      const move = (e: PointerEvent) => {
        if (!active) return;
        const dx = e.clientX - px, dy = e.clientY - py;
        px = e.clientX; py = e.clientY;
        const tx = e.clientX - ox, ty = e.clientY - oy;
        el.style.transform = `translate(${tx}px, ${ty}px)`;
        options.onDrag?.(e, { point: {x: e.clientX, y: e.clientY}, delta: {x: dx, y: dy}, offset: {x: tx, y: ty}, velocity: {x: dx, y: dy} });
      };

      const up = (e: PointerEvent) => {
        if (!active) return;
        active = false;
        el.releasePointerCapture?.(e.pointerId);
        options.onDragEnd?.(e, { point: {x: e.clientX, y: e.clientY}, delta: {x: 0, y: 0}, offset: {x: px - ox, y: py - oy}, velocity: {x: 0, y: 0} });
      };

      el.addEventListener('pointerdown', down as EventListener);
      el.addEventListener('pointermove', move as EventListener);
      el.addEventListener('pointerup', up as EventListener);
      el.addEventListener('pointercancel', up as EventListener);
      cleanups.push(() => {
        el.removeEventListener('pointerdown', down as EventListener);
        el.removeEventListener('pointermove', move as EventListener);
        el.removeEventListener('pointerup', up as EventListener);
        el.removeEventListener('pointercancel', up as EventListener);
      });
    }
  }

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

/**
 * SVG animations (stroke drawing, morphing, attribute animation).
 * Default engine: GSAP (MorphSVGPlugin, DrawSVGPlugin).
 * Fallback: Anime.js if GSAP unavailable.
 */
export const svg = {
  /**
   * SVG stroke drawing (line draw effect).
   * Uses GSAP DrawSVGPlugin if available, falls back to Anime.js strokeDashoffset.
   */
  draw(targets: MorphTargets, options?: MorphSvgOptions): MorphControls {
    const isReverse = options?.direction === 'reverse' || options?.direction === 'alternate-reverse';
    const elements: any[] =
      typeof targets === 'string' && typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll(targets))
        : Array.isArray(targets) || targets instanceof NodeList
        ? Array.from(targets as any)
        : [targets];

    let len = 500;
    elements.forEach((el) => {
      if (el?.getTotalLength) {
        len = el.getTotalLength();
        el.style.strokeDasharray = `${len}`;
        el.setAttribute('stroke-dasharray', `${len}`);
      }
    });

    // Try GSAP DrawSVGPlugin first
    return createDeferred(
      () => loadGsap().catch(() => loadAnime()),
      (mod) => {
        if (mod.gsap && mod.DrawSVGPlugin) {
          const { gsap } = mod;
          const vars = toGsapOptions({}, options);
          if (isReverse) {
            return wrapGsapControls(gsap.to(targets, { drawSVG: 0, ...vars }));
          }
          return wrapGsapControls(gsap.from(targets, { drawSVG: 0, ...vars }));
        }

        // Anime.js fallback
        const anime = mod;
        const from = isReverse ? 0 : len;
        const to = isReverse ? len : 0;
        return wrapControls(
          anime.animate(elements, toAnimeOptions({ strokeDashoffset: [from, to] }, options)),
          true
        );
      }
    );
  },

  /**
   * SVG path morphing.
   * Uses GSAP MorphSVGPlugin if available (handles mismatched points), falls back to Anime.js.
   */
  morph(targets: MorphTargets, options: MorphSvgOptions & { d: [string, string] }): MorphControls {
    const { d, ...animOpts } = options;

    // Try GSAP MorphSVGPlugin first
    return createDeferred(
      () => loadGsap().catch(() => loadAnime()),
      (mod) => {
        if (mod.gsap && mod.MorphSVGPlugin) {
          const { gsap } = mod;
          const vars = toGsapOptions({}, animOpts);
          vars.morphSVG = { shape: d[1] };
          return wrapGsapControls(gsap.to(targets, vars));
        }

        // Anime.js fallback
        const anime = mod;
        return wrapControls(
          anime.animate(targets, toAnimeOptions({ d }, animOpts)),
          true
        );
      }
    );
  },

  /**
   * Animate arbitrary SVG attributes.
   * Uses GSAP's built-in attr plugin, falls back to Anime.js.
   */
  attr(targets: MorphTargets, attributes: Record<string, any>, options?: MorphAnimationOptions): MorphControls {
    return createDeferred(
      () => loadGsap().catch(() => loadAnime()),
      (mod) => {
        if (mod.gsap) {
          const { gsap } = mod;
          const vars = toGsapOptions({}, options);
          vars.attr = attributes;
          return wrapGsapControls(gsap.to(targets, vars));
        }

        // Anime.js fallback
        const anime = mod;
        return wrapControls(
          anime.animate(targets, toAnimeOptions(attributes, options)),
          true
        );
      }
    );
  },
};
