// ponytail: both motion and animejs evaluate easing curves natively. No duplicate math needed.
import type { EasingFunction, EasingValue } from '../types';

export const customEasings = new Map<string, EasingFunction>();

export function registerEasing(name: string, fn: EasingFunction): void {
  customEasings.set(name, fn);
}

export function resolveEasing(input: EasingValue): any {
  if (typeof input === 'function') return input;
  if (typeof input === 'string' && customEasings.has(input)) return customEasings.get(input)!;
  return input;
}

/** Convert easing to Motion-compatible value */
export function toMotionEasing(input?: EasingValue): any {
  if (!input) return undefined;
  if (typeof input === 'function') return input;
  if (typeof input === 'string' && customEasings.has(input)) return customEasings.get(input);
  return input; // motion natively supports bezier arrays, strings ('linear', 'easeIn', 'easeOut', 'easeInOut', etc.)
}

/** Convert easing to Anime.js v4-compatible value */
export function toAnimeEasing(input?: EasingValue): any {
  if (!input) return undefined;
  if (typeof input === 'function') return input;
  if (typeof input === 'string' && customEasings.has(input)) return customEasings.get(input);
  if (Array.isArray(input)) return `cubicBezier(${input.join(',')})`;
  return input;
}

/** Map MorphJS easing names → GSAP easing strings */
const gsapEasingMap: Record<string, string> = {
  linear: 'none',
  easeIn: 'power1.in',
  easeOut: 'power1.out',
  easeInOut: 'power1.inOut',
  easeInQuad: 'power2.in',
  easeOutQuad: 'power2.out',
  easeInOutQuad: 'power2.inOut',
  easeInCubic: 'power3.in',
  easeOutCubic: 'power3.out',
  easeInOutCubic: 'power3.inOut',
  easeInQuart: 'power4.in',
  easeOutQuart: 'power4.out',
  easeInOutQuart: 'power4.inOut',
  easeInElastic: 'elastic.in(1, 0.3)',
  easeOutElastic: 'elastic.out(1, 0.3)',
  easeInOutElastic: 'elastic.inOut(1, 0.3)',
  easeInBounce: 'bounce.in',
  easeOutBounce: 'bounce.out',
  easeInOutBounce: 'bounce.inOut',
  easeInBack: 'back.in(1.7)',
  easeOutBack: 'back.out(1.7)',
  easeInOutBack: 'back.inOut(1.7)',
};

/** Convert easing to GSAP-compatible value */
export function toGsapEasing(input?: EasingValue): any {
  if (!input) return undefined;
  if (typeof input === 'function') return input;
  if (typeof input === 'string' && customEasings.has(input)) return customEasings.get(input);
  if (typeof input === 'string' && gsapEasingMap[input]) return gsapEasingMap[input];
  return input; // pass through GSAP-native strings like 'power2.out'
}
