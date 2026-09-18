import type { MorphTargets, MorphSvgOptions, MorphControls, MorphAnimationOptions } from '../types';
import { resolveAdapter } from '../router';
import { stateManager } from '../state';
import { animationEvents } from '../events';
import { resolveTargets } from '../utils/targets';
import { animate } from './animate';
import { createNoopControls } from './scroll';

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
    return animate(targets, { d }, { ...animOptions, adapter: 'anime' });
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

    const isReverse = options?.direction === 'reverse';

    elements.forEach(el => {
      if (el instanceof SVGGeometryElement) {
        const length = el.getTotalLength ? el.getTotalLength() : 500;
        el.style.strokeDasharray = `${length}`;
        el.setAttribute('stroke-dasharray', `${length}`);
      }
    });

    const first = elements[0];
    const len = first instanceof SVGGeometryElement && first.getTotalLength ? first.getTotalLength() : 500;
    const from = isReverse ? 0 : len;
    const to = isReverse ? len : 0;

    return animate(elements, { strokeDashoffset: [from, to] }, options);
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

    return animate(targets, attributes, { ...options, adapter: 'anime' });
  }
};
