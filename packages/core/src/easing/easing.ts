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
