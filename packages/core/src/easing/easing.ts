import type { CubicBezier, EasingFunction, EasingValue } from '../types';

function cubicBezier([x1, y1, x2, y2]: CubicBezier): EasingFunction {
  const sample = (t: number, a: number, b: number) =>
    ((1 + 3 * (a - b)) * t + 3 * (b - 2 * a)) * t * t + 3 * a * t;

  return progress => {
    if (progress === 0 || progress === 1) return progress;
    let min = 0;
    let max = 1;
    for (let i = 0; i < 24; i++) {
      const t = (min + max) / 2;
      const x = sample(t, x1, x2);
      if (x === progress) return sample(t, y1, y2);
      if (x < progress) min = t;
      else max = t;
    }
    return sample((min + max) / 2, y1, y2);
  };
}

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
  if (Array.isArray(input)) return cubicBezier(input);
  if (typeof input === 'string' && /^ease[A-Z]/.test(input)) return input[4].toLowerCase() + input.slice(5);
  return input; // pass through Anime-native strings like 'out(3)' or 'inOutQuad'
}

/** Map MorphJS easing names → GSAP easing strings */
const gsapEasingMap: Record<string, string> = {
  linear: 'none',
  easeIn: 'power1.in',
  easeOut: 'power1.out',
  easeInOut: 'power1.inOut',
  easeInQuad: 'power1.in',
  easeOutQuad: 'power1.out',
  easeInOutQuad: 'power1.inOut',
  easeInCubic: 'power2.in',
  easeOutCubic: 'power2.out',
  easeInOutCubic: 'power2.inOut',
  easeInQuart: 'power3.in',
  easeOutQuart: 'power3.out',
  easeInOutQuart: 'power3.inOut',
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
  if (Array.isArray(input)) return cubicBezier(input);
  if (typeof input === 'string' && customEasings.has(input)) return customEasings.get(input);
  if (typeof input === 'string' && gsapEasingMap[input]) return gsapEasingMap[input];
  return input; // pass through GSAP-native strings like 'power2.out'
}
