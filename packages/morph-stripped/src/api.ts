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
 *
 * Balanced Architecture:
 * - Motion.js: Default for CSS tweens & transforms (WAAPI compositor thread, ultra-light).
 * - Anime.js: Default for repeat / looped animations.
 * - GSAP: Heavy artillery for specialized choreographies via `{ engine: 'gsap' }`.
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

  // Repeating / looped animations or SVG paths → Anime.js (lighter rAF timer, 100% MIT)
  if ('d' in properties || 'strokeDashoffset' in properties || opts.repeat !== undefined) {
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(anime.animate(targets, toAnimeOptions(properties, opts)), true);
    });
  }

  // Default: Motion.js for fast WAAPI CSS/transform tweens
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
 *
 * Balanced Architecture:
 * - Anime.js: Default lightweight timeline (keeps baseline bundle tiny & 100% MIT).
 * - GSAP: Available for advanced nested timelines / labels via `{ engine: 'gsap' }`.
 */
export function timeline(options?: TimelineOptions): MorphTimeline {
  const segments: Array<{ targets: any; props: any; offset?: any }> = [];
  let realTl: any = null;
  const useGsap = options?.engine === 'gsap';
  let activeEngine: 'gsap' | 'anime' = useGsap ? 'gsap' : 'anime';

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

  const buildGsap = ({ gsap }: any) => {
    const defaults: Record<string, any> = {};
    if (options?.defaults?.duration !== undefined) defaults.duration = options.defaults.duration;
    if (options?.defaults?.ease !== undefined) defaults.ease = options.defaults.ease;

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

  const loader = useGsap
    ? () => loadGsap().catch(() => { activeEngine = 'anime'; return loadAnime(); })
    : () => loadAnime().catch(() => { activeEngine = 'gsap'; return loadGsap(); });

  const deferred = createDeferred(
    loader,
    (mod) => (activeEngine === 'gsap' ? buildGsap(mod) : buildAnime(mod))
  );

  const tlObject: MorphTimeline = Object.assign(deferred, {
    add(targets: any, props: any, offset?: any) {
      if (realTl) {
        if (activeEngine === 'gsap') {
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
      if (realTl && activeEngine === 'gsap') {
        realTl.addLabel(name, offset);
      }
      return tlObject;
    },
    addPause(offset?: any, cb?: any) {
      if (realTl && activeEngine === 'gsap') {
        realTl.addPause(offset, cb);
      }
      return tlObject;
    },
    get duration() {
      if (!realTl) return 0;
      return activeEngine === 'gsap' ? (realTl.duration() || 0) : (realTl.duration || 0) / 1000;
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
 *
 * Balanced Architecture:
 * - Motion.js: Default ultra-lightweight WAAPI scroll tracking.
 * - GSAP ScrollTrigger: Activated when specialized capabilities (`pin`, `scrub`, or `{ engine: 'gsap' }`) are needed.
 */
export function scroll(
  animationOrCallback: MorphControls | ((progress: number) => void),
  options?: MorphScrollOptions
): MorphControls {
  const needsScrollTrigger = Boolean(options?.pin || options?.scrub || options?.engine === 'gsap');

  if (needsScrollTrigger) {
    return createDeferred(
      () => loadGsap().catch(() => loadMotion()),
      (mod) => {
        if (mod.gsap && mod.ScrollTrigger) {
          const { gsap, ScrollTrigger } = mod;

          if (typeof animationOrCallback === 'function') {
            const trigger = ScrollTrigger.create({
              trigger: options?.target || document.documentElement,
              scroller: options?.container,
              start: 'top top',
              end: 'bottom bottom',
              pin: options?.pin ?? false,
              scrub: options?.scrub ?? false,
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

          return wrapGsapControls(
            gsap.to({}, {
              scrollTrigger: {
                trigger: options?.target || document.documentElement,
                scroller: options?.container,
                pin: options?.pin ?? false,
                scrub: options?.scrub ?? true,
                start: 'top top',
                end: 'bottom bottom',
              },
            })
          );
        }

        // Fallback to Motion.js
        const res = mod.scroll(animationOrCallback, options);
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

  // Default: Motion.js lightweight scroll tracking
  return createDeferred(loadMotion, (motion) => {
    const res = motion.scroll(animationOrCallback, options);
    if (typeof animationOrCallback === 'function') {
      return {
        play: () => {},
        pause: () => {},
        reverse: () => {},
        cancel: () => {
          if (typeof res === 'function') res();
        },
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
  });
}

/**
 * Gesture bindings (drag, hover, press). Returns cleanup function.
 * Uses Motion.js for hover/press, native pointer events with capture for drag.
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
        options.onDragStart?.(e, { point: { x: e.clientX, y: e.clientY }, delta: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } });
      };

      const move = (e: PointerEvent) => {
        if (!active) return;
        const dx = e.clientX - px, dy = e.clientY - py;
        px = e.clientX; py = e.clientY;
        const tx = e.clientX - ox, ty = e.clientY - oy;
        el.style.transform = `translate(${tx}px, ${ty}px)`;
        options.onDrag?.(e, { point: { x: e.clientX, y: e.clientY }, delta: { x: dx, y: dy }, offset: { x: tx, y: ty }, velocity: { x: dx, y: dy } });
      };

      const up = (e: PointerEvent) => {
        if (!active) return;
        active = false;
        el.releasePointerCapture?.(e.pointerId);
        options.onDragEnd?.(e, { point: { x: e.clientX, y: e.clientY }, delta: { x: 0, y: 0 }, offset: { x: px - ox, y: py - oy }, velocity: { x: 0, y: 0 } });
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
 *
 * Balanced Architecture:
 * - Anime.js: Default engine for SVG draw, standard morph, and attributes (lightweight & MIT).
 * - GSAP: Activated for complex mismatched-point morphs or specialized DrawSVG via `{ engine: 'gsap' }`.
 */
export const svg = {
  /**
   * SVG stroke drawing (line draw effect).
   * Default: Anime.js (fast strokeDashoffset, light bundle).
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

    if (options?.engine === 'gsap') {
      return createDeferred(loadGsap, ({ gsap, DrawSVGPlugin }) => {
        const vars = toGsapOptions({}, options);
        if (DrawSVGPlugin) {
          return isReverse
            ? wrapGsapControls(gsap.to(targets, { drawSVG: 0, ...vars }))
            : wrapGsapControls(gsap.from(targets, { drawSVG: 0, ...vars }));
        }
        const from = isReverse ? 0 : len;
        const to = isReverse ? len : 0;
        return wrapGsapControls(gsap.fromTo(elements, { strokeDashoffset: from }, { strokeDashoffset: to, ...vars }));
      });
    }

    // Default: Anime.js
    const from = isReverse ? 0 : len;
    const to = isReverse ? len : 0;
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(
        anime.animate(elements, toAnimeOptions({ strokeDashoffset: [from, to] }, options)),
        true
      );
    });
  },

  /**
   * SVG path morphing.
   * Default: Anime.js.
   * Specialized: GSAP MorphSVGPlugin for complex shapes with unequal anchor points.
   */
  morph(targets: MorphTargets, options: MorphSvgOptions & { d: [string, string] }): MorphControls {
    const { d, ...animOpts } = options;

    if (options?.engine === 'gsap' || options?.morphPrecision !== undefined) {
      return createDeferred(loadGsap, ({ gsap, MorphSVGPlugin }) => {
        const vars = toGsapOptions({}, animOpts);
        if (MorphSVGPlugin) {
          vars.morphSVG = { shape: d[1] };
          return wrapGsapControls(gsap.to(targets, vars));
        }
        vars.attr = { d: d[1] };
        return wrapGsapControls(gsap.to(targets, vars));
      });
    }

    // Default: Anime.js
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(
        anime.animate(targets, toAnimeOptions({ d }, animOpts)),
        true
      );
    });
  },

  /**
   * Animate arbitrary SVG attributes.
   * Default: Anime.js.
   */
  attr(targets: MorphTargets, attributes: Record<string, any>, options?: MorphAnimationOptions): MorphControls {
    if ((options as any)?.engine === 'gsap') {
      return createDeferred(loadGsap, ({ gsap }) => {
        const vars = toGsapOptions({}, options);
        vars.attr = attributes;
        return wrapGsapControls(gsap.to(targets, vars));
      });
    }

    // Default: Anime.js
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(
        anime.animate(targets, toAnimeOptions(attributes, options)),
        true
      );
    });
  },
};
