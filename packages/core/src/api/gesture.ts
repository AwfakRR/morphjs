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

type DragState = { base?: ReturnType<typeof readTranslation>; x: number; y: number };
const dragStates = new WeakMap<Element, DragState>();

function bindDrag(el: HTMLElement | SVGElement, options: MorphGestureOptions): () => void {
  const { constraints, momentum, snapToOrigin } = typeof options.drag === 'object' ? options.drag : {};
  const clamp = (value: number, min?: number, max?: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
  const state: DragState = dragStates.get(el) ?? { x: 0, y: 0 };
  dragStates.set(el, state);
  const x = { key: 'x' as const, from: 0, start: 0, previous: 0, velocity: 0, min: constraints?.left, max: constraints?.right };
  const y = { key: 'y' as const, from: 0, start: 0, previous: 0, velocity: 0, min: constraints?.top, max: constraints?.bottom };
  let pointerId: number | undefined;
  let lastMove = 0;
  let release = 0;
  const animations: Array<{ stop(): void }> = [];

  const render = () => {
    const [left, top] = state.base ?? [0, 0];
    el.style.transform = `translate(${left + state.x}px, ${top + state.y}px)`;
  };
  const snapBack = () => {
    if (!state.x && !state.y) return;
    state.x = state.y = 0;
    render();
  };
  const stop = () => {
    release++;
    animations.splice(0).forEach(animation => animation.stop());
  };
  const info = (e: PointerEvent, dx = 0, dy = 0): GestureInfo => ({
    point: { x: e.clientX, y: e.clientY },
    delta: { x: dx, y: dy },
    offset: { x: state.x, y: state.y },
    velocity: { x: x.velocity, y: y.velocity },
  });

  const down = (event: Event) => {
    const e = event as PointerEvent;
    if (pointerId !== undefined) return;
    stop();
    const current = readTranslation(el);
    if (current && (!state.base ||
        !matchesTranslation(current[0], state.base[0] + state.x) ||
        !matchesTranslation(current[1], state.base[1] + state.y))) {
      state.base = current;
      state.x = state.y = 0;
    }
    pointerId = e.pointerId;
    for (const [axis, point] of [[x, e.clientX], [y, e.clientY]] as const) {
      axis.from = state[axis.key];
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
      state[axis.key] = clamp(axis.from + point - axis.start, axis.min, axis.max);
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
        const position = state[axis.key];
        const power = 0.8;
        const destination = snapToOrigin ? 0 : clamp(position + power * axis.velocity, axis.min, axis.max);
        if (destination === position) continue;
        const onUpdate = (position: number) => {
          if (id !== release) return;
          state[axis.key] = snapToOrigin ? position : clamp(position, axis.min, axis.max);
          render();
        };
        animations.push(snapToOrigin
          ? animate(position, 0, { type: 'spring', stiffness: 300, damping: 30, onUpdate })
          : animate(position, destination, {
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

function matchesTranslation(current: number, rendered: number): boolean {
  return current === rendered || current === Number(Math.fround(rendered).toPrecision(6));
}

function readTranslation(el: Element): [number, number] | undefined {
  if (typeof getComputedStyle === 'undefined') return;
  const matrix = /^matrix(3d)?\((.+)\)$/.exec(getComputedStyle(el).transform);
  if (!matrix) return [0, 0];
  const values = matrix[2].split(',');
  const x = matrix[1] ? 12 : 4;
  return [Number(values[x]) || 0, Number(values[x + 1]) || 0];
}
