import type {
  FlipAnimationEntry,
  FlipArg,
  FlipRect,
  FlipSnapshot,
  FlipState,
  IAnimationAdapter,
  MorphControls,
  MorphFlipOptions,
  MorphSpringOptions,
  MorphTargets,
} from '../types';
import { getConfig, resolveAdapter, shouldReduceMotion } from '../router';
import { adapterRegistry } from '../adapters/adapter';
import { resolveTargets } from '../utils/targets';
import { createNoopControls, groupControls, notifyControlsCanceled, onControlsCancel } from '../utils/controls';
import { createDeferredControls } from '../utils/deferred-controls';
import { motionAdapter } from '../adapters/motion-adapter';
import { stateManager } from '../state';
import { animationEvents } from '../events';
import { prepareStagger } from './stagger';

export interface FlipCallable {
  (targets: MorphTargets, mutate: () => void, options?: FlipArg): MorphControls;
  capture(targets: MorphTargets): FlipState;
  from(state: FlipState, options?: FlipArg): MorphControls;
}

const POSITION_EPSILON = 0.5;
const SCALE_EPSILON = 0.005;
const OPACITY_EPSILON = 0.01;

const activeFlips = new WeakMap<Element, { cancel: () => void }>();

function isConnectedElement(el: Element): boolean {
  return el.isConnected !== false;
}

function isStyledElement(el: Element): el is HTMLElement | SVGElement {
  return 'style' in el && (el as HTMLElement).style != null;
}

function readRect(el: Element): FlipRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function readOpacity(el: Element): number | undefined {
  if (typeof getComputedStyle !== 'function') return undefined;
  const value = parseFloat(getComputedStyle(el).opacity);
  return Number.isFinite(value) ? value : undefined;
}

function readTransformOrigin(el: Element, rect: FlipRect): [number, number] {
  if (typeof getComputedStyle === 'function') {
    const raw = getComputedStyle(el).transformOrigin;
    if (raw) {
      const parts = raw.split(/\s+/);
      if (parts.length >= 2 && parts[0].endsWith('px') && parts[1].endsWith('px')) {
        const ox = parseFloat(parts[0]);
        const oy = parseFloat(parts[1]);
        if (Number.isFinite(ox) && Number.isFinite(oy)) {
          return [ox, oy];
        }
      }
    }
  }
  return [rect.width / 2, rect.height / 2];
}

function escapeAttrValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function buildInlineTransform(entry: FlipAnimationEntry): string {
  const parts: string[] = [];
  if (entry.dx !== 0 || entry.dy !== 0) {
    parts.push(`translate3d(${entry.dx}px, ${entry.dy}px, 0)`);
  }
  if (entry.scaleX !== 1 || entry.scaleY !== 1) {
    parts.push(`scale(${entry.scaleX}, ${entry.scaleY})`);
  }
  return parts.join(' ');
}

function once(callback?: () => void): (() => void) | undefined {
  if (!callback) return undefined;
  let pending: (() => void) | undefined = callback;
  return () => {
    const fn = pending;
    pending = undefined;
    fn?.();
  };
}

/**
 * Capture the current layout geometry (First) of one or more elements.
 *
 * @example
 * const state = flip.capture('.card');
 * container.classList.toggle('grid');
 * flip.from(state, { duration: 0.4, ease: 'easeOut' });
 */
function capture(targets: MorphTargets): FlipState {
  const snapshots = new Map<Element, FlipSnapshot>();
  const byId = new Map<string, FlipSnapshot>();

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { snapshots, byId };
  }

  for (const el of resolveTargets(targets)) {
    if (!isConnectedElement(el)) continue;
    const flipId = typeof el.getAttribute === 'function'
      ? el.getAttribute('data-flip-id') ?? undefined
      : undefined;
    const snapshot: FlipSnapshot = {
      element: el,
      rect: readRect(el),
      flipId,
      opacity: readOpacity(el),
    };
    snapshots.set(el, snapshot);
    if (flipId) byId.set(flipId, snapshot);
  }

  return { snapshots, byId };
}

/**
 * Measure the new layout geometry (Last), invert the delta (Invert),
 * and animate elements smoothly back to their natural layout (Play).
 */
function from(state: FlipState, options: FlipArg = {}): MorphControls {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return createNoopControls();
  }

  const opts: MorphFlipOptions = typeof options === 'number' ? { duration: options } : { ...options };
  const { defaultDuration, defaultEase } = getConfig();
  const duration = opts.duration ?? defaultDuration;
  const ease = opts.ease ?? defaultEase;
  const scale = opts.scale ?? true;
  const fade = opts.fade ?? false;
  const prune = opts.prune ?? true;
  const reduceMotion = shouldReduceMotion();
  const springOpts: MorphSpringOptions | undefined =
    opts.spring === true ? {} : typeof opts.spring === 'object' ? opts.spring : undefined;

  const matched: Array<{ element: Element; snapshot: FlipSnapshot }> = [];
  if (opts.targets !== undefined) {
    for (const el of resolveTargets(opts.targets)) {
      if (!isConnectedElement(el)) continue;
      const flipId = typeof el.getAttribute === 'function'
        ? el.getAttribute('data-flip-id') ?? undefined
        : undefined;
      const snapshot = state.snapshots.get(el) ?? (flipId ? state.byId.get(flipId) : undefined);
      if (snapshot) matched.push({ element: el, snapshot });
    }
  } else {
    for (const [el, snapshot] of state.snapshots) {
      if (isConnectedElement(el)) {
        matched.push({ element: el, snapshot });
      } else if (snapshot.flipId && typeof document.querySelector === 'function') {
        const replacement = document.querySelector(
          `[data-flip-id="${escapeAttrValue(snapshot.flipId)}"]`
        );
        if (replacement && isConnectedElement(replacement)) {
          matched.push({ element: replacement, snapshot });
        }
      }
    }
  }

  // Cancel any in-flight FLIP on matched elements before measuring their new layout rect.
  for (const { element } of matched) {
    activeFlips.get(element)?.cancel();
  }

  type MeasuredEntry = FlipAnimationEntry & { savedTransform?: string };
  const entries: MeasuredEntry[] = [];

  for (const { element, snapshot } of matched) {
    const first = snapshot.rect;
    const last = readRect(element);
    if (last.width === 0 && last.height === 0) continue;

    const canScale = scale && first.width > 0 && first.height > 0 && last.width > 0 && last.height > 0;
    const rawScaleX = canScale ? first.width / last.width : 1;
    const rawScaleY = canScale ? first.height / last.height : 1;
    const hasScaleX = canScale && Math.abs(rawScaleX - 1) >= SCALE_EPSILON;
    const hasScaleY = canScale && Math.abs(rawScaleY - 1) >= SCALE_EPSILON;
    const scaleX = hasScaleX ? rawScaleX : 1;
    const scaleY = hasScaleY ? rawScaleY : 1;

    const [ox, oy] = hasScaleX || hasScaleY ? readTransformOrigin(element, last) : [0, 0];
    const rawDx = first.left - last.left - ox * (1 - scaleX);
    const rawDy = first.top - last.top - oy * (1 - scaleY);
    const hasX = Math.abs(rawDx) >= POSITION_EPSILON;
    const hasY = Math.abs(rawDy) >= POSITION_EPSILON;
    const dx = hasX ? rawDx : 0;
    const dy = hasY ? rawDy : 0;

    const properties: Record<string, any> = {};
    if (hasX) properties.x = [dx, 0];
    if (hasY) properties.y = [dy, 0];
    if (hasScaleX) properties.scaleX = [scaleX, 1];
    if (hasScaleY) properties.scaleY = [scaleY, 1];

    if (fade && snapshot.opacity !== undefined) {
      const lastOpacity = readOpacity(element);
      if (lastOpacity !== undefined && Math.abs(snapshot.opacity - lastOpacity) >= OPACITY_EPSILON) {
        properties.opacity = [snapshot.opacity, lastOpacity];
      }
    }

    if (Object.keys(properties).length === 0) continue;

    entries.push({
      element,
      first,
      last,
      dx,
      dy,
      scaleX,
      scaleY,
      properties,
      savedTransform: isStyledElement(element) ? element.style.transform : undefined,
    });
  }

  if (entries.length === 0) {
    opts.onComplete?.();
    return createNoopControls();
  }

  if (reduceMotion) {
    opts.onStart?.();
    opts.onComplete?.();
    return createNoopControls();
  }

  const elements = entries.map(entry => entry.element);
  const adapter = resolveAdapter({
    adapter: opts.adapter,
    engine: opts.engine,
    spring: springOpts,
    layout: true,
  });

  const animationOptions: MorphFlipOptions = {
    ...opts,
    duration,
    ease,
  };

  const hasTransformDelta = (entry: MeasuredEntry) =>
    entry.dx !== 0 || entry.dy !== 0 || entry.scaleX !== 1 || entry.scaleY !== 1;

  const clearInlineTransform = (entry: MeasuredEntry) => {
    if (hasTransformDelta(entry) && isStyledElement(entry.element)) {
      entry.element.style.transform = entry.savedTransform ?? '';
    }
  };

  const restoreTransform = (entry: MeasuredEntry) => {
    if (prune) {
      clearInlineTransform(entry);
    }
  };

  let anySuperseded = false;

  const startEntries = (
    backend: IAnimationAdapter,
    resolvedOpts: MorphFlipOptions,
    activeEntries: MeasuredEntry[] = entries,
  ): MorphControls => {
    if (activeEntries.length === 0) {
      return createNoopControls();
    }
    if (backend.layout) {
      const ctrl = backend.layout(activeEntries, resolvedOpts);
      let resolveSuperseded: (() => void) | undefined;
      const superseded = new Promise<void>(resolve => { resolveSuperseded = resolve; });
      let completed = false;
      const cleanup = () => {
        completed = true;
        for (const entry of activeEntries) {
          if (activeFlips.get(entry.element) === active) {
            activeFlips.delete(entry.element);
          }
        }
      };
      const active = {
        cancel: () => {
          anySuperseded = true;
          ctrl.cancel();
          cleanup();
          resolveSuperseded?.();
        },
      };
      for (const entry of activeEntries) {
        activeFlips.set(entry.element, active);
      }
      let settled!: Promise<void>;
      const observeBase = () => {
        const base = ctrl.finished;
        void base.then(cleanup, cleanup);
        settled = Promise.race([base, superseded]);
      };
      observeBase();
      const wrapped: MorphControls = Object.create(ctrl, {
        cancel: {
          value: () => {
            ctrl.cancel();
            cleanup();
            notifyControlsCanceled(wrapped);
          },
        },
        restart: {
          value: () => {
            completed = false;
            ctrl.restart();
            observeBase();
          },
        },
        play: {
          value: () => {
            const wasCompleted = completed;
            if (wasCompleted) completed = false;
            ctrl.play();
            if (wasCompleted) observeBase();
          },
        },
        finished: { get: () => settled },
        then: { value: (onFulfilled: any, onRejected: any) => settled.then(onFulfilled, onRejected) },
      });
      onControlsCancel(ctrl, () => {
        cleanup();
        notifyControlsCanceled(wrapped);
      });
      return wrapped;
    }

    const { delay, onStart, onUpdate, onComplete, onCancel, scale: _s, spring: _sp, targets: _t, fade: _f, prune: _p, ...shared } = resolvedOpts;
    const startOnce = once(onStart);
    const cancelOnce = once(onCancel);
    let supersededCount = 0;

    const perElement = activeEntries.map((entry, index) => {
      const elDelay = typeof delay === 'function' ? delay(index, activeEntries.length) : delay;
      const elOpts = {
        ...shared,
        delay: elDelay,
        onStart: startOnce,
        onUpdate: index === 0 ? onUpdate : undefined,
        onCancel: cancelOnce,
      };
      const ctrl = springOpts && backend.spring
        ? backend.spring([entry.element], entry.properties, springOpts, elOpts)
        : backend.animate([entry.element], entry.properties, elOpts);

      // Read ctrl.finished once per run so thenables like Anime.js v4 don't drop earlier subscribers.
      let resolveSuperseded: (() => void) | undefined;
      let superseded = new Promise<void>(resolve => { resolveSuperseded = resolve; });
      let wasSuperseded = false;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (activeFlips.get(entry.element) === active) {
          activeFlips.delete(entry.element);
        }
        restoreTransform(entry);
      };
      const active = {
        cancel: () => {
          if (!wasSuperseded) {
            wasSuperseded = true;
            supersededCount++;
            anySuperseded = true;
          }
          ctrl.cancel();
          cleanup();
          resolveSuperseded?.();
        },
      };
      activeFlips.set(entry.element, active);
      onControlsCancel(ctrl, cleanup);

      let elementFinished!: Promise<void>;
      const observeBase = () => {
        const base = ctrl.finished;
        void base.then(cleanup, cleanup);
        elementFinished = Promise.race([base, superseded]);
      };
      const resetForReplay = () => {
        cleaned = false;
        if (wasSuperseded) {
          wasSuperseded = false;
          supersededCount = Math.max(0, supersededCount - 1);
          if (supersededCount === 0) anySuperseded = false;
          superseded = new Promise<void>(resolve => { resolveSuperseded = resolve; });
        }
        activeFlips.set(entry.element, active);
      };
      observeBase();

      return Object.create(ctrl, {
        restart: {
          value: () => {
            resetForReplay();
            ctrl.restart();
            observeBase();
          },
        },
        play: {
          value: () => {
            const wasDone = cleaned;
            if (wasDone) resetForReplay();
            ctrl.play();
            if (wasDone) observeBase();
          },
        },
        finished: { get: () => elementFinished },
        then: { value: (onFulfilled: any, onRejected: any) => elementFinished.then(onFulfilled, onRejected) },
      }) as MorphControls;
    });

    return groupControls(
      perElement,
      () => {
        if (supersededCount === 0) {
          onComplete?.();
        }
      },
      backend === motionAdapter ? control => control.seek?.(0) : undefined,
    );
  };

  const pendingDelay = prepareStagger(animationOptions.delay, elements);
  const applyPendingInvert = () => {
    const pendingHandles = new Map<Element, { cancel: () => void }>();
    for (const entry of entries) {
      if (isStyledElement(entry.element)) {
        const inline = buildInlineTransform(entry);
        if (inline) entry.element.style.transform = inline;
      }
      const active = {
        cancel: () => {
          if (activeFlips.get(entry.element) === active) {
            activeFlips.delete(entry.element);
          }
          clearInlineTransform(entry);
        },
      };
      activeFlips.set(entry.element, active);
      pendingHandles.set(entry.element, active);
    }
    return pendingHandles;
  };

  const loadAndFlip = async (
    deferred: ReturnType<typeof createDeferredControls>,
    pendingHandles: Map<Element, { cancel: () => void }>,
  ) => {
    let resolvedOpts = animationOptions;
    let canceledBeforeStart = false;
    const stopCancelWatch = onControlsCancel(deferred.controls, () => {
      canceledBeforeStart = true;
      for (const [el, handle] of pendingHandles) {
        if (activeFlips.get(el) === handle) handle.cancel();
      }
      opts.onCancel?.();
    });

    try {
      if (pendingDelay) resolvedOpts = { ...animationOptions, delay: await pendingDelay };
      let chosenAdapter = adapter;
      try {
        await chosenAdapter.ensure?.();
      } catch (loadErr) {
        if (opts.adapter || opts.engine) throw loadErr;
        let recovered = false;
        for (const fallbackName of ['anime', 'gsap']) {
          const fallback = adapterRegistry.get(fallbackName);
          if (!fallback || fallback === chosenAdapter) continue;
          try {
            await fallback.ensure?.();
            chosenAdapter = fallback;
            recovered = true;
            break;
          } catch {
            // Try next installed engine.
          }
        }
        if (!recovered) throw loadErr;
      }
      stopCancelWatch();
      if (canceledBeforeStart) {
        deferred.resolve(createNoopControls());
        return;
      }
      const remaining = entries.filter(entry => activeFlips.get(entry.element) === pendingHandles.get(entry.element));
      for (const entry of remaining) {
        clearInlineTransform(entry);
      }
      deferred.resolve(startEntries(chosenAdapter, resolvedOpts, remaining));
    } catch (err) {
      stopCancelWatch();
      for (const [el, handle] of pendingHandles) {
        if (activeFlips.get(el) === handle) handle.cancel();
      }
      deferred.reject(err);
      console.error('[MorphJS] Deferred flip animation failed:', err);
    }
  };

  let animControls: MorphControls;
  if (pendingDelay) {
    const pendingHandles = applyPendingInvert();
    const deferred = createDeferredControls();
    void loadAndFlip(deferred, pendingHandles);
    animControls = deferred.controls;
  } else {
    try {
      animControls = startEntries(adapter, animationOptions);
    } catch {
      const pendingHandles = applyPendingInvert();
      const deferred = createDeferredControls();
      void loadAndFlip(deferred, pendingHandles);
      animControls = deferred.controls;
    }
  }

  const id = stateManager.register(animControls, elements);
  let canceled = false;
  onControlsCancel(animControls, () => {
    canceled = true;
    stateManager.unregister(id);
  });

  animationEvents.emit('start', {
    type: 'start',
    target: elements,
    controls: animControls,
    timestamp: Date.now(),
  });

  animControls.finished.then(() => {
    if (!canceled && !anySuperseded) {
      animationEvents.emit('complete', {
        type: 'complete',
        target: elements,
        controls: animControls,
        timestamp: Date.now(),
      });
    }
    stateManager.unregister(id);
  }, () => stateManager.unregister(id));

  return animControls;
}

/**
 * Animate layout changes using the FLIP (First, Last, Invert, Play) technique.
 *
 * @example
 * // One-step FLIP: capture, mutate DOM, and animate
 * flip('.card', () => container.classList.toggle('grid'), 0.4);
 *
 * @example
 * // Two-step FLIP for async or framework-driven DOM updates
 * const state = flip.capture('.card');
 * reorderCards();
 * flip.from(state, { duration: 0.4, ease: 'easeOut' });
 */
export const flip: FlipCallable = Object.assign(
  (targets: MorphTargets, mutate: () => void, options?: FlipArg): MorphControls => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return createNoopControls();
    }
    const state = capture(targets);
    mutate();
    return from(state, options);
  },
  {
    capture,
    from,
  },
);
