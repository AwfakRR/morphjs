import type { MorphTargets, MorphSvgOptions, MorphControls, MorphAnimationOptions } from '../types';
import { resolveTargets } from '../utils/targets';
import { createNoopControls } from '../utils/controls';
import { animateSvg } from './animate';

/**
 * SVG animation utilities — morph paths, draw strokes, animate attributes.
 */
export const svg = {
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
    const length = lengths.every(len => len === lengths[0])
      ? lengths[0]
      : (targetOrIndex: Element | number, index: number) => lengths[typeof targetOrIndex === 'number' ? targetOrIndex : index];
    return animateSvg(elements, { strokeDashoffset: isReverse ? [0, length] : [length, 0] }, options);
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
