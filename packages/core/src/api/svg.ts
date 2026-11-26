import type { MorphTargets, MorphSvgOptions, MorphControls, MorphAnimationOptions, MorphMotionPathOptions } from '../types';
import { resolveTargets } from '../utils/targets';
import { createNoopControls } from '../utils/controls';
import { animateSvg } from './animate';

/**
 * SVG animation utilities — morph paths, draw strokes, animate attributes.
 */
export const svg = {
  /**
   * Translate targets along SVG geometry, optionally rotating to its tangent.
   */
  motionPath(targets: MorphTargets, path: string | SVGGeometryElement, options: MorphMotionPathOptions = {}): MorphControls {
    if (typeof window === 'undefined' || typeof document === 'undefined') return createNoopControls();

    let geometry: SVGGeometryElement | null;
    try {
      geometry = typeof path === 'string' ? document.querySelector<SVGGeometryElement>(path) : path;
    } catch {
      return createNoopControls();
    }
    if (typeof geometry?.getTotalLength !== 'function' || typeof geometry.getPointAtLength !== 'function') {
      return createNoopControls();
    }

    const length = geometry.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return createNoopControls();

    const { start = 0, end = 1, autoRotate, ease = 'linear', ...timing } = options;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const from = (Number.isFinite(start) ? clamp(start) : 0) * length;
    const to = (Number.isFinite(end) ? clamp(end) : 1) * length;
    const tween = (sample: (distance: number) => number) => ({
      from: 0,
      to: 1,
      modifier: (progress: number) => sample(from + (to - from) * clamp(progress)),
    });
    const properties = {
      translateX: tween(distance => geometry.getPointAtLength(distance).x),
      translateY: tween(distance => geometry.getPointAtLength(distance).y),
      ...(autoRotate && {
        rotate: tween(distance => {
          const delta = Math.min(1, length / 2);
          const before = geometry.getPointAtLength(Math.max(0, distance - delta));
          const after = geometry.getPointAtLength(Math.min(length, distance + delta));
          return Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
        }),
      }),
    };
    return animateSvg(targets, properties, { ...timing, ease, engine: 'anime' });
  },

  /**
   * Morph an SVG path from one shape to another.
   *
   * @example
   * svg.morph('.shape path', {
   *   d: ['M10 80 Q 95 10 180 80', 'M10 80 Q 95 150 180 80'],
   *   duration: 1.5,
   *   ease: 'easeInOut',
   *   direction: 'alternate',
   *   repeat: Infinity
   * });
   */
  morph(targets: MorphTargets, options: MorphSvgOptions & { d: [string, string] }): MorphControls {
    if (typeof window === 'undefined') {
      return createNoopControls();
    }

    const { d, ...animOptions } = options;
    return animateSvg(targets, { d }, animOptions);
  },

  /**
   * Animate SVG stroke drawing (line draw effect).
   *
   * @example
   * svg.draw('.path', { duration: 2, ease: 'easeInOut' });
   *
   * @example
   * // Draw in reverse (erase)
   * svg.draw('.path', { duration: 1, direction: 'reverse' });
   */
  draw(targets: MorphTargets, options?: MorphAnimationOptions): MorphControls {
    if (typeof window === 'undefined') {
      return createNoopControls();
    }

    const elements = resolveTargets(targets);
    if (elements.length === 0) return createNoopControls();

    const isReverse = options?.direction === 'reverse' || options?.direction === 'alternate-reverse';

    const lengths = elements.map(el => {
      if (typeof SVGGeometryElement === 'undefined' || !(el instanceof SVGGeometryElement)) return 500;

      const length = el.getTotalLength ? el.getTotalLength() : 500;
      el.style.strokeDasharray = `${length}`;
      el.setAttribute('stroke-dasharray', `${length}`);
      return length;
    });

    // Anime passes (target, index); the GSAP dash-offset fallback passes (index, target).
    const lengthAt = (targetOrIndex: Element | number, index: number) =>
      lengths[typeof targetOrIndex === 'number' ? targetOrIndex : index];
    const offsets = (length: number | typeof lengthAt) => ({ strokeDashoffset: isReverse ? [0, length] : [length, 0] });
    return lengths.every(length => length === lengths[0])
      ? animateSvg(elements, offsets(lengths[0]), options)
      : animateSvg(elements, offsets(lengthAt), options, index => offsets(lengths[index]));
  },

  /**
   * Animate arbitrary SVG attributes.
   *
   * @example
   * svg.attr('.circle', {
   *   r: [10, 50],
   *   cx: [100, 200],
   *   fill: ['#ff0000', '#0000ff']
   * }, { duration: 1 });
   */
  attr(targets: MorphTargets, attributes: Record<string, any>, options?: MorphAnimationOptions): MorphControls {
    if (typeof window === 'undefined') {
      return createNoopControls();
    }

    return animateSvg(targets, attributes, options);
  }
};
