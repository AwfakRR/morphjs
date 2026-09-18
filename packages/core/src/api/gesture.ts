// ponytail: clean gesture delegation to motion with lightweight native fallback
import type { MorphTargets, MorphGestureOptions, GestureInfo } from '../types';
import { resolveAdapter } from '../router';
import { resolveTargets } from '../utils/targets';

export function gesture(targets: MorphTargets, options: MorphGestureOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  const adapter = resolveAdapter({ gesture: true });
  const elements = resolveTargets(targets);

  if (adapter.gesture) {
    try {
      const res = adapter.gesture(elements, options);
      return typeof res === 'function' ? res : res.cleanup;
    } catch {
      // Fall through to native pointer/drag implementation
    }
  }

  const cleanups: Array<() => void> = [];

  for (const el of elements) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;

    if (options.hover) {
      const enter = (e: Event) => options.onHoverStart?.(e);
      const leave = (e: Event) => options.onHoverEnd?.(e);
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointerleave', leave);
      });
    }

    if (options.press) {
      const down = (e: Event) => options.onPressStart?.(e);
      const up = (e: Event) => options.onPressEnd?.(e);
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      cleanups.push(() => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      });
    }

    if (options.drag) {
      let active = false;
      let ox = 0, oy = 0, px = 0, py = 0;

      const down = (e: PointerEvent) => {
        active = true;
        ox = px = e.clientX;
        oy = py = e.clientY;
        el.setPointerCapture?.(e.pointerId);
        options.onDragStart?.(e, makeInfo(e.clientX, e.clientY, 0, 0, 0, 0));
      };

      const move = (e: PointerEvent) => {
        if (!active) return;
        const dx = e.clientX - px, dy = e.clientY - py;
        px = e.clientX; py = e.clientY;
        const tx = e.clientX - ox, ty = e.clientY - oy;
        el.style.transform = `translate(${tx}px, ${ty}px)`;
        options.onDrag?.(e, makeInfo(e.clientX, e.clientY, dx, dy, tx, ty));
      };

      const up = (e: PointerEvent) => {
        if (!active) return;
        active = false;
        el.releasePointerCapture?.(e.pointerId);
        options.onDragEnd?.(e, makeInfo(e.clientX, e.clientY, 0, 0, px - ox, py - oy));
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

  return () => cleanups.forEach(fn => fn());
}

function makeInfo(x: number, y: number, dx: number, dy: number, ox: number, oy: number): GestureInfo {
  return {
    point: { x, y },
    delta: { x: dx, y: dy },
    offset: { x: ox, y: oy },
    velocity: { x: dx, y: dy },
  };
}
