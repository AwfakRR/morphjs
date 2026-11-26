import type { MorphTargets, MorphSvgOptions, MorphControls, MorphAnimationOptions, MorphMotionPathOptions } from '../types';
import { resolveTargets } from '../utils/targets';
import { createNoopControls } from '../utils/controls';
import { animateSvg } from './animate';

const pathTransforms = new WeakMap<CSSStyleDeclaration, { inline: string; priority: string; value: string }>();

function splitPathTransform(base: string, computed: string, autoRotate?: boolean) {
  if (autoRotate && computed.startsWith('matrix')) {
    const type = computed.slice(0, computed.indexOf('('));
    const values = computed.slice(type.length + 1, -1).split(',').map(Number);
    const is3D = type === 'matrix3d';
    const start = is3D ? 12 : 4;
    const [x, y, z = 0, w = 1] = values.slice(start);
    if (w && (x || y || z)) {
      const offset = is3D ? ` translate3d(${x / w}px,${y / w}px,${z / w}px)` : ` translate(${x}px,${y}px)`;
      if (is3D) {
        for (let i = 0; i < 16; i += 4) {
          values[i] -= x / w * values[i + 3];
          values[i + 1] -= y / w * values[i + 3];
          values[i + 2] -= z / w * values[i + 3];
        }
      } else {
        values.fill(0, start);
      }
      return { offset, linear: ` ${type}(${values.join(',')})` };
    }
  }
  return { offset: '', linear: base ? ` ${base}` : '' };
}

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
    let length: number;
    try {
      geometry = typeof path === 'string' ? document.querySelector<SVGGeometryElement>(path) : path;
      if (typeof geometry?.getTotalLength !== 'function' || typeof geometry.getPointAtLength !== 'function') {
        return createNoopControls();
      }
      length = geometry.getTotalLength();
    } catch {
      return createNoopControls();
    }
    if (!Number.isFinite(length) || length <= 0) return createNoopControls();

    const { start = 0, end = 1, autoRotate, ease = 'linear', ...timing } = options;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const from = (Number.isFinite(start) ? clamp(start) : 0) * length;
    const to = (Number.isFinite(end) ? clamp(end) : 1) * length;
    const progressTarget = (elements: Element[]) => {
      const markers = elements.flatMap(element => {
        const style = (element as HTMLElement).style;
        if (!style) return [];
        const previous = pathTransforms.get(style);
        const value = style.transform;
        const { inline, priority } = previous?.value === value
          ? previous
          : { inline: value, priority: style.getPropertyPriority?.('transform') ?? '' };
        const readTransform = () => window.getComputedStyle?.(element).transform ?? '';
        let computed: string;
        if (inline === value) {
          computed = readTransform();
        } else {
          const cancelTransformTransition = () => {
            if (!element.getAnimations) return;
            readTransform();
            for (const animation of element.getAnimations()) {
              if ('transitionProperty' in animation && animation.transitionProperty === 'transform') animation.cancel();
            }
          };
          try {
            if (priority) style.setProperty('transform', inline, priority);
            else style.transform = inline;
            cancelTransformTransition();
            computed = readTransform();
          } finally {
            style.transform = value;
            cancelTransformTransition();
          }
        }
        const composable = inline.includes('(') && !/\b(?:var|env|attr)\(/i.test(inline);
        const original = composable ? inline : computed;
        const base = original === 'none' ? '' : original;
        return [{ style, inline, priority, ...splitPathTransform(base, computed, autoRotate) }];
      });

      let progress = 0;
      return {
        get progress() { return progress; },
        set progress(value: number) {
          progress = value;
          const distance = from + (to - from) * clamp(value);
          const point = geometry.getPointAtLength(distance);
          const translation = `translate(${point.x}px,${point.y}px)`;
          let rotation = '';
          if (autoRotate) {
            const delta = Math.min(1, length / 2);
            const before = geometry.getPointAtLength(Math.max(0, distance - delta));
            const after = geometry.getPointAtLength(Math.min(length, distance + delta));
            const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
            rotation = ` rotate(${angle}deg)`;
          }
          for (const { style, inline, priority, offset, linear } of markers) {
            style.transform = translation + offset + rotation + linear;
            pathTransforms.set(style, { inline, priority, value: style.transform });
          }
        },
      };
    };
    return animateSvg(targets, { progress: [0, 1] }, { ...timing, ease, engine: 'anime' }, undefined, progressTarget);
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
