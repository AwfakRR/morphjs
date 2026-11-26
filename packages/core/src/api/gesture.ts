// ponytail: clean gesture delegation to motion with lightweight native fallback
import type { MorphTargets, MorphGestureOptions, GestureInfo } from '../types';
import { ensureMotion, motionAdapter } from '../adapters/motion-adapter';
import { resolveAdapter, shouldReduceMotion } from '../router';
import { resolveTargets } from '../utils/targets';

export function gesture(targets: MorphTargets, options: MorphGestureOptions): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const adapter = resolveAdapter({ gesture: true });
  const elements = resolveTargets(targets);
  const cleanups: Array<() => void> = [];
  let useNativeHoverPress = true;

  if (adapter.gesture) {
    try {
      const res = adapter.gesture(elements, options);
      const cleanup = typeof res === 'function' ? res : res.cleanup;
      if (adapter !== motionAdapter || !options.drag) return cleanup;
      cleanups.push(cleanup);
      useNativeHoverPress = false;
    } catch {
      // Fall through to native pointer/drag implementation
    }
  }

  for (const el of elements) {
    if (!(typeof HTMLElement !== 'undefined' && el instanceof HTMLElement) &&
        !(typeof SVGElement !== 'undefined' && el instanceof SVGElement)) continue;

    if (useNativeHoverPress && options.hover) {
      const enter = (e: Event) => options.onHoverStart?.(e);
      const leave = (e: Event) => options.onHoverEnd?.(e);
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointerleave', leave);
      });
    }

    if (useNativeHoverPress && options.press) {
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

    if (options.drag) cleanups.push(bindDrag(el, options));
  }

  return () => cleanups.forEach(fn => fn());
}

function bindDrag(el: HTMLElement | SVGElement, options: MorphGestureOptions): () => void {
  const { constraints, momentum, snapToOrigin } = typeof options.drag === 'object' ? options.drag : {};
  const clamp = (value: number, min?: number, max?: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
  const x = { position: 0, from: 0, start: 0, previous: 0, velocity: 0, min: constraints?.left, max: constraints?.right };
  const y = { position: 0, from: 0, start: 0, previous: 0, velocity: 0, min: constraints?.top, max: constraints?.bottom };
  let pointerId: number | undefined;
  let lastMove = 0;
  let release = 0;
  const animations: Array<{ stop(): void }> = [];

  const render = () => { el.style.transform = `translate(${x.position}px, ${y.position}px)`; };
  const snapBack = () => {
    if (!x.position && !y.position) return;
    x.position = y.position = 0;
    render();
  };
  const stop = () => {
    release++;
    animations.splice(0).forEach(animation => animation.stop());
  };
  const info = (e: PointerEvent, dx = 0, dy = 0): GestureInfo => ({
    point: { x: e.clientX, y: e.clientY },
    delta: { x: dx, y: dy },
    offset: { x: x.position, y: y.position },
    velocity: { x: x.velocity, y: y.velocity },
  });

  const down = (event: Event) => {
    const e = event as PointerEvent;
    if (pointerId !== undefined) return;
    stop();
    pointerId = e.pointerId;
    for (const [axis, point] of [[x, e.clientX], [y, e.clientY]] as const) {
      axis.from = axis.position;
      axis.start = axis.previous = point;
      axis.velocity = 0;
    }
    lastMove = e.timeStamp;
    el.setPointerCapture?.(e.pointerId);
    options.onDragStart?.(e, info(e));
  };

  const move = (event: Event) => {
    const e = event as PointerEvent;
    if (pointerId === undefined || pointerId !== e.pointerId) return;
    const dx = e.clientX - x.previous, dy = e.clientY - y.previous;
    const elapsed = e.timeStamp - lastMove;
    for (const [axis, point, delta] of [[x, e.clientX, dx], [y, e.clientY, dy]] as const) {
      axis.velocity = elapsed > 0 && elapsed <= 100 ? delta * 1000 / elapsed : 0;
      axis.previous = point;
      axis.position = clamp(axis.from + point - axis.start, axis.min, axis.max);
    }
    lastMove = e.timeStamp;
    render();
    options.onDrag?.(e, info(e, dx, dy));
  };

  const up = (event: Event) => {
    const e = event as PointerEvent;
    if (pointerId === undefined || pointerId !== e.pointerId) return;
    pointerId = undefined;
    if (e.type !== 'lostpointercapture') el.releasePointerCapture?.(e.pointerId);
    if (e.type !== 'pointerup' || e.timeStamp - lastMove > 100) x.velocity = y.velocity = 0;
    const id = ++release;
    options.onDragEnd?.(e, info(e));
    if (id !== release || (!snapToOrigin && (!momentum || (!x.velocity && !y.velocity)))) return;
    if (shouldReduceMotion()) {
      if (snapToOrigin) snapBack();
      return;
    }

    ensureMotion().then(({ animate }) => {
      if (id !== release) return;
      for (const axis of [x, y]) {
        const power = 0.8;
        const destination = snapToOrigin ? 0 : clamp(axis.position + power * axis.velocity, axis.min, axis.max);
        if (destination === axis.position) continue;
        const onUpdate = (position: number) => {
          if (id !== release) return;
          axis.position = snapToOrigin ? position : clamp(position, axis.min, axis.max);
          render();
        };
        animations.push(snapToOrigin
          ? animate(axis.position, 0, { type: 'spring', stiffness: 300, damping: 30, onUpdate })
          : animate(axis.position, destination, {
            type: 'inertia', velocity: axis.velocity, power, min: axis.min, max: axis.max,
            modifyTarget: () => destination, onUpdate,
          }));
      }
    }).catch(() => {
      if (id !== release) return;
      stop();
      if (snapToOrigin) snapBack();
    });
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  return () => {
    stop();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('lostpointercapture', up);
    if (pointerId !== undefined) {
      el.releasePointerCapture?.(pointerId);
      pointerId = undefined;
    }
  };
}
