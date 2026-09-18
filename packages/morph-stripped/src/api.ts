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
  wrapControls,
  createDeferred,
  toAnimeOptions,
  runSpring,
} from './engine';

export type AnimateArg = MorphAnimationOptions | number;

/**
 * Animate targets with CSS or SVG properties.
 * Supports duration shorthand (e.g. animate('.box', { x: 100 }, 0.5)).
 */
export function animate(
  targets: MorphTargets,
  properties: Record<string, any>,
  options?: AnimateArg
): MorphControls {
  const opts: MorphAnimationOptions = typeof options === 'number' ? { duration: options } : options || {};

  // If SVG path morphing, SVG stroke drawing, or explicit repeat, use Anime.js v4
  if ('d' in properties || 'strokeDashoffset' in properties || opts.repeat !== undefined) {
    return createDeferred(loadAnime, (anime) => {
      const animeOpts = toAnimeOptions(properties, opts);
      return wrapControls(anime.animate(targets, animeOpts), true);
    });
  }

  // Otherwise, default to Motion for fast CSS/transform tweens
  return createDeferred(loadMotion, (motion) => {
    return wrapControls(motion.animate(targets, properties, opts as any), false);
  });
}

/**
 * Animate with spring physics.
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
 */
export function timeline(options?: TimelineOptions): MorphTimeline {
  const segments: Array<{ targets: any; props: any; offset?: any }> = [];
  let animeTl: any = null;

  const build = (anime: any) => {
    const tl = anime.createTimeline({
      autoplay: options?.autoplay ?? true,
      defaults: options?.defaults ? toAnimeOptions(options.defaults) : undefined,
    });
    for (const s of segments) {
      tl.add(s.targets, toAnimeOptions(s.props), s.offset);
    }
    return tl;
  };

  const deferred = createDeferred(loadAnime, (anime) => {
    animeTl = build(anime);
    return wrapControls(animeTl, true);
  });

  const tlObject: MorphTimeline = Object.assign(deferred, {
    add(targets: any, props: any, offset?: any) {
      if (animeTl) {
        animeTl.add(targets, toAnimeOptions(props), offset);
      } else {
        segments.push({ targets, props, offset });
      }
      return tlObject;
    },
    label(_name: string, _offset?: any) {
      return tlObject;
    },
    addPause(_offset?: any, _cb?: any) {
      return tlObject;
    },
    get duration() {
      return animeTl ? (animeTl.duration || 0) / 1000 : 0;
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
 */
export function scroll(
  animationOrCallback: MorphControls | ((progress: number) => void),
  options?: MorphScrollOptions
): MorphControls {
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
        playState: 'running',
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
 */
export const svg = {
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

    const from = isReverse ? 0 : len;
    const to = isReverse ? len : 0;

    return animate(elements, { strokeDashoffset: [from, to] }, options);
  },

  morph(targets: MorphTargets, options: MorphSvgOptions & { d: [string, string] }): MorphControls {
    const { d, ...animOpts } = options;
    return animate(targets, { d }, animOpts);
  },

  attr(targets: MorphTargets, attributes: Record<string, any>, options?: MorphAnimationOptions): MorphControls {
    return createDeferred(loadAnime, (anime) => {
      return wrapControls(anime.animate(targets, toAnimeOptions(attributes, options)), true);
    });
  },
};
