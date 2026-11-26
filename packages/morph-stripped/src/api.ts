import type {
  MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphStaggerOptions,
  MorphScrollOptions, MorphGestureOptions, MorphSvgOptions, MorphMotionPathOptions, TimelineOptions,
  MorphControls, MorphTimeline,
} from './types';
import { loadMotion, loadAnime, loadGsapCore, loadScrollTrigger, loadMorphSVG, loadDrawSVG, wrap, createDeferred, toAnimeOptions, toAnimePosition, toGsapOptions, runSpring } from './engine';
import { inView } from './in-view';

export type AnimateArg = MorphAnimationOptions | number;

const noop = () => {};
const mkd = (cancel?: () => void): MorphControls => ({ play: noop, pause: noop, reverse: noop, cancel: cancel ?? noop, finish: noop, restart: noop, seek: noop, progress: 0, currentTime: 0, playState: cancel ? 'running' : 'idle', finished: Promise.resolve(), then: (f) => Promise.resolve().then(f), commitStyles: noop });

export function animate(tgts: MorphTargets, props: Record<string, any>, opt?: AnimateArg): MorphControls {
  if (typeof window === 'undefined' || typeof document === 'undefined') return mkd();
  const o: any = typeof opt === 'number' ? { duration: opt } : opt || {};
  const e = o.engine || o.adapter;
  const startMotion = () => createDeferred(loadMotion, (m) => {
    // Preserve which options Motion sees when resolving default timing.
    const transition = Object.prototype.propertyIsEnumerable.call(o, 'onCancel')
      ? { ...o, onCancel: undefined }
      : o;
    return wrap(m.animate(tgts, props, transition), 'm', m.frame, o.onCancel);
  });
  if (e === 'gsap') return createDeferred(() => loadGsapFor(props), ({ gsap }) => wrap(gsap.to(tgts, toGsapOptions(props, o)), 'g'));
  if (e === 'motion') return startMotion();
  if (e === 'anime' || 'd' in props || 'strokeDashoffset' in props || o.repeat !== undefined)
    return createDeferred(loadAnime, (a) => wrap(a.animate(tgts, toAnimeOptions(props, o)), 'a'));
  return startMotion();
}

export function spring(tgts: MorphTargets, props: Record<string, any>, opt?: MorphSpringOptions): MorphControls {
  if (typeof window === 'undefined' || typeof document === 'undefined') return mkd();
  return createDeferred(loadMotion, (m) => runSpring(m, tgts, props, opt));
}

async function loadGsapFor(props: Record<string, any>) {
  const [gsap] = await Promise.all([
    loadGsapCore(),
    props.scrollTrigger !== undefined && loadScrollTrigger(),
    props.morphSVG !== undefined && loadMorphSVG(),
    props.drawSVG !== undefined && loadDrawSVG(),
  ]);
  return gsap;
}

type Position = string | number;
type AnimeModule = typeof import('animejs');
type AnimeSegment = { host: any; start: number; duration: number; labels: Record<string, number>; previous: boolean };
type AnimeTrack = (host: any, segment?: AnimeSegment) => void;
type TimelineState = {
  ready: () => Promise<void>;
  native: () => { tl: any; engine: 'g' | 'a'; anime: AnimeModule };
  adopt: () => void;
  mount: (host: any, start: number) => number;
  parent?: TimelineState;
};
const timelines = new WeakMap<MorphTimeline, TimelineState>();

function animeOffset(tl: any, position?: Position, segment?: AnimeSegment): number {
  if (segment) {
    const relative = /^(.+)?([+*-])=([^=]+)$/.exec(String(position));
    const label = relative ? relative[1] : position;
    const offset = typeof label === 'string' && label.startsWith('<')
      ? (segment.previous ? animeOffset(tl, label.startsWith('<<') ? '<<' : '<') - segment.start : NaN)
      : label === undefined ? segment.duration : segment.labels[label] ?? (relative ? NaN : segment.duration);
    const value = Number(relative?.[3]);
    return relative ? relative[2] === '*' ? offset * value : offset + (relative[2] === '+' ? value : -value)
      : position !== undefined && Number.isFinite(Number(position)) ? Number(position) : offset;
  }
  let name = '_';
  while (Object.hasOwn(tl.labels, name)) name += '_';
  tl.label(name, position);
  const offset = tl.labels[name];
  delete tl.labels[name];
  return offset;
}

function withAnimeStart(value: any, from: (target: object) => unknown): any {
  if (Array.isArray(value)) {
    if (value.length > 1 && typeof value[0] !== 'object') return value;
    return value.length ? [withAnimeStart(value[0], from), ...value.slice(1)] : value;
  }
  const key = value && typeof value === 'object' ? value : { to: value };
  return key.from !== undefined || Array.isArray(key.to) ? value : { ...key, from };
}

export function timeline(opt?: TimelineOptions): MorphTimeline {
  const seq: Array<() => void> = [];
  const tracks: AnimeTrack[] = [];
  const firstProperties = new WeakMap<object, Map<string, number>>();
  let anime: AnimeModule;
  let mixedHost: any;
  let segment: AnimeSegment | undefined;
  let completeAnime!: () => void;
  const animeFinished = new Promise<void>(resolve => { completeAnime = resolve; });
  let realTl: any = null;
  let activeEngine: 'g' | 'a' = opt?.engine === 'gsap' ? 'g' : 'a';
  let autoplay = opt?.autoplay !== false;
  let pending: Promise<void> | undefined;

  const enqueue = (run: () => void, load?: Promise<unknown> | false) => {
    if (!pending && !load) {
      run();
      return;
    }
    const next = Promise.all([pending, load]).then(run);
    pending = next;
    void next.then(() => { if (pending === next) pending = undefined; }, () => {});
  };

  const step = (run: () => void) => {
    if (!realTl) seq.push(run);
    else run();
  };
  const control = (run: () => void) => step(() => enqueue(run));
  const addAnime = (run: () => void) => {
    const { paused, currentTime, duration, reversed } = realTl;
    run();
    if (!paused) {
      if (realTl.reversed !== reversed) realTl.alternate();
      realTl.seek(reversed ? realTl.duration - (duration - currentTime) : currentTime, true).resume();
    }
  };
  const recordAnime = (track: AnimeTrack, changesDuration = true) => {
    const insert: AnimeTrack = (host, current) => {
      track(host, current);
      if (current && changesDuration) {
        current.previous = true;
        current.duration = Math.max(current.duration, animeOffset(host, '<') - current.start);
      }
    };
    tracks.push(insert);
    if (!state.parent) {
      if (changesDuration) addAnime(() => insert(realTl));
      else insert(realTl);
    }
  };
  const loadEngine = () => activeEngine === 'g' ? loadGsapCore() : loadAnime();
  const ready = loadEngine().catch(() => {
    activeEngine = activeEngine === 'g' ? 'a' : 'g';
    return loadEngine();
  }).then((m: any) => {
    if (activeEngine === 'g') {
      const d: Record<string, any> = {};
      if (opt?.defaults?.duration !== undefined) d.duration = opt.defaults.duration;
      if (opt?.defaults?.ease !== undefined) d.ease = opt.defaults.ease;
      realTl = m.gsap.timeline({
        paused: true,
        defaults: Object.keys(d).length ? toGsapOptions(d) : undefined,
      });
    } else {
      anime = m;
      realTl = m.createTimeline({
        autoplay: false,
        onComplete: completeAnime,
        defaults: opt?.defaults ? toAnimeOptions(opt.defaults, undefined, true) : undefined,
      });
    }
    seq.splice(0).forEach(run => run());
    return pending;
  });
  const state: TimelineState = {
    ready: () => ready.then(() => pending),
    native: () => ({ tl: realTl, engine: activeEngine, anime }),
    adopt: () => {
      if (realTl && activeEngine === 'a' && !realTl.cancelled) realTl.cancel();
    },
    mount: (host, start) => {
      if (!realTl.cancelled) realTl.cancel();
      const current = segment = { host, start, duration: 0, labels: Object.create(null), previous: false };
      for (const insert of tracks) insert(host, current);
      host.add({ delay: 0, duration: current.duration, onComplete: completeAnime }, start);
      return current.duration;
    },
  };

  const deferred = createDeferred(() => ready, () => {
    if (activeEngine === 'g') return wrap(realTl, 'g');
    const controls = wrap(realTl, 'a');
    controls.seek = (time) => {
      if (!segment && state.parent) return;
      const host = segment?.host ?? realTl;
      const position = segment
        ? segment.start + Math.max(0, Math.min(segment.duration, time * 1000))
        : time * 1000;
      host.seek(host.reversed ? host.duration - position : position);
    };
    for (const key of ['play', 'pause', 'reverse', 'cancel', 'restart', 'finish'] as const) {
      const run = controls[key];
      controls[key] = () => { if (!state.parent) run(); };
    }
    Object.defineProperty(controls, 'finished', { value: animeFinished });
    return controls;
  });

  const seek = (position: Position) => {
    if (typeof position === 'number') {
      deferred.seek?.(position);
      return true;
    }
    const labels = segment?.labels ?? realTl.labels;
    const relative = /^(.+)([+-])=([^=]+)$/.exec(position);
    const name = Object.hasOwn(labels, position) ? position : relative?.[1];
    if (name === undefined || !Object.hasOwn(labels, name)) return false;
    const offset = name === position ? 0 : Number(relative![3]) * (relative![2] === '-' ? -1 : 1);
    if (!Number.isFinite(offset)) return false;
    deferred.seek?.(labels[name] / (activeEngine === 'a' ? 1000 : 1) + offset);
    return true;
  };

  const tlo: MorphTimeline = {
    ...deferred,
    add(t: MorphTargets | MorphTimeline, p?: Record<string, any> | Position, o?: Position) {
      if (typeof p !== 'object') {
        const child = timelines.get(t as MorphTimeline);
        if (!child || child.parent) throw new TypeError('Expected an unattached morph-stripped timeline');
        for (let ancestor: TimelineState | undefined = state; ancestor; ancestor = ancestor.parent) {
          if (ancestor === child) throw new TypeError('Cannot nest a timeline inside itself');
        }
        child.parent = state;
        child.adopt();
        step(() => enqueue(() => {
          const { tl, engine, anime: animeModule } = child.native();
          if (activeEngine === 'a' && engine === 'a') {
            recordAnime((host, current) =>
              child.mount(host, (current?.start ?? 0) + animeOffset(host, toAnimePosition(p), current)));
          } else if (activeEngine === 'g' && engine === 'g') {
            realTl.add(tl, p);
            tl.paused(false);
          } else {
            const controls = t as MorphTimeline;
            if (engine === 'a') {
              mixedHost ??= animeModule.createTimeline({ autoplay: false });
              const host = mixedHost;
              const clock = {
                get time() { return 0; },
                set time(_: number) { host.seek(realTl.time() * 1000); },
              };
              realTl.fromTo(clock, { time: 0 }, { time: 1, duration: 0, ease: 'none', immediateRender: false }, p);
              const tween = realTl.recent();
              tween.duration(child.mount(host, tween.startTime() * 1000) / 1000);
            } else {
              controls.pause();
              const clock = {
                get time() { return controls.currentTime; },
                set time(time: number) { controls.seek(time); },
              };
              recordAnime((host, current) => host.add(clock,
                { time: [0, controls.duration], duration: controls.duration * 1000, delay: 0, ease: 'linear' },
                (current?.start ?? 0) + animeOffset(host, toAnimePosition(p), current)));
            }
          }
        }, child.ready()));
      } else {
        step(() => {
          if (activeEngine === 'g') {
            enqueue(() => { realTl.to(t, toGsapOptions(p), o); },
              (p.scrollTrigger !== undefined || p.morphSVG !== undefined || p.drawSVG !== undefined) && loadGsapFor(p));
          } else {
            enqueue(() => {
              const params = toAnimeOptions(p, undefined, true);
              const options: Record<string, any> = { ...realTl.defaults, ...params };
              const { $, get } = anime.utils;
              const targets = $(t);
              let replay: Record<string, any> | undefined;
              recordAnime((host, current) => {
                const offset = animeOffset(host, toAnimePosition(o), current);
                const definition = current ? replay ?? options : params;
                if (!replay) {
                  replay = { ...options };
                  for (const property of Object.keys(params)) {
                    if (property in realTl.defaults) continue;
                    const starts = new Map<object, any>();
                    for (const target of targets) {
                      let first = firstProperties.get(target);
                      if (!first) firstProperties.set(target, first = new Map());
                      if (!first.has(property) || offset < first.get(property)!) {
                        first.set(property, offset);
                        starts.set(target, get(target, property));
                      }
                    }
                    if (starts.size) replay[property] = withAnimeStart(params[property], target => starts.get(target));
                  }
                }
                host.add(current ? targets : t, definition, (current?.start ?? 0) + offset);
              });
            });
          }
        });
      }
      return tlo;
    },
    label(n: string, o?: Position) {
      step(() => enqueue(() => {
        if (activeEngine === 'g') realTl.addLabel(n, o);
        else recordAnime((host, current) => {
          if (current) current.labels[n] = animeOffset(host, toAnimePosition(o), current);
          else host.label(n, toAnimePosition(o));
        }, false);
      }));
      return tlo;
    },
    addLabel(n: string, o?: Position) {
      return tlo.label(n, o);
    },
    addPause(o?: Position, c?: () => void) {
      if (realTl && activeEngine === 'g') enqueue(() => { realTl.addPause(o, c); });
      return tlo;
    },
    seek(position: Position) {
      control(() => { seek(position); });
    },
    play(position?: Position) {
      control(() => {
        if (position === undefined || seek(position)) deferred.play();
      });
    },
    pause: () => control(deferred.pause),
    reverse: () => control(deferred.reverse),
    restart: () => control(deferred.restart),
    finish: () => control(deferred.finish),
    commitStyles: () => control(deferred.commitStyles),
    cancel() {
      autoplay = false;
      control(() => {
        if (activeEngine === 'g') deferred.pause();
        deferred.cancel();
      });
    },
    get playState() {
      if (segment) return tlo.currentTime >= tlo.duration ? 'finished' : 'paused';
      return deferred.playState;
    },
    get duration() {
      if (segment) return segment.duration / 1000;
      if (!realTl) return 0;
      return activeEngine === 'g' ? (realTl.duration?.() ?? 0) : ((realTl.duration ?? 0) / 1000);
    },
    get currentTime() {
      if (segment) return Math.max(0, Math.min(segment.duration, segment.host.iterationCurrentTime - segment.start)) / 1000;
      if (!realTl) return 0;
      return activeEngine === 'g' ? (realTl.time?.() ?? 0) : realTl.iterationCurrentTime / 1000;
    },
    get progress() {
      if (segment) return tlo.currentTime / tlo.duration || 0;
      if (!realTl) return 0;
      return (activeEngine === 'g' ? realTl.progress?.() : realTl.iterationProgress) ?? 0;
    },
  };

  timelines.set(tlo, state);
  if (autoplay) {
    Promise.resolve().then(() => { if (autoplay && !state.parent) tlo.play(); });
  }
  return tlo;
}

export function stagger(v: number, o?: MorphStaggerOptions): any {
  return (i: number, t = 1): number => {
    let ei = i;
    if (o?.from === 'last') ei = t - 1 - i;
    else if (o?.from === 'center') {
      const grid = o.grid;
      if (grid?.length === 2) {
        const [columns, rows] = grid;
        ei = Math.hypot(i % columns - (columns - 1) / 2, Math.floor(i / columns) - (rows - 1) / 2);
      } else {
        ei = Math.abs(i - (t - 1) / 2);
      }
    }
    else if (o?.from === 'random') ei = Math.random() * t;
    else if (typeof o?.from === 'number') ei = Math.abs(i - o.from);
    return (typeof o?.start === 'number' ? o.start : 0) + ei * v;
  };
}

function trackScroll(a: MorphControls | ((p: number) => void), o?: MorphScrollOptions): MorphControls {
  if (typeof window === 'undefined' || typeof document === 'undefined') return mkd();
  if (o?.pin || o?.scrub || o?.engine === 'gsap') {
    return createDeferred(() => loadScrollTrigger().then(m => m.ScrollTrigger ? m : loadMotion(), () => loadMotion()), (m) => {
      if (m.ScrollTrigger) {
        const vars = {
          trigger: o?.target || document.documentElement,
          scroller: o?.container,
          start: 'top top',
          end: 'bottom bottom',
          pin: o?.pin ?? false,
        };
        if (typeof a === 'function') {
          const trigger = m.ScrollTrigger.create({ ...vars, scrub: o?.scrub ?? false, onUpdate: (s: { progress: number }) => a(s.progress) });
          return mkd(() => trigger.kill());
        }
        a.pause();
        const playhead = { progress: 0 };
        const animation = m.gsap.to(playhead, {
          progress: 1,
          duration: 1,
          ease: 'none',
          paused: true,
          onUpdate: () => a.seek?.(playhead.progress * (a.duration ?? 0)),
        });
        m.ScrollTrigger.create({ ...vars, scrub: o?.scrub ?? true, animation });
        return wrap(animation, 'g');
      }
      const r = m.scroll(a, o);
      return typeof a === 'function' ? mkd(() => { if (typeof r === 'function') r(); }) : a;
    });
  }
  return createDeferred(loadMotion, (m) => {
    const r = m.scroll(a, o);
    return typeof a === 'function' ? mkd(() => { if (typeof r === 'function') r(); }) : a;
  });
}

export const scroll = Object.assign(trackScroll, { inView });

export function gesture(t: MorphTargets, o?: MorphGestureOptions): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const c: Array<() => void> = [];
  const els = typeof t === 'string' ? Array.from(document.querySelectorAll(t)) : Array.isArray(t) ? t :
    typeof NodeList !== 'undefined' && t instanceof NodeList ? Array.from(t) : [t];
  let disposed = false;
  if (o?.hover || o?.press) {
    loadMotion().then((m: any) => {
      if (disposed) return;
      if (o.hover && m.hover) {
        const hc = m.hover(t, (_: Element, event: PointerEvent) => {
          o.onHoverStart?.(event);
          return o.onHoverEnd;
        });
        if (typeof hc === 'function') c.push(hc);
      }
      if (o.press && m.press) {
        const pc = m.press(t, (_: Element, event: PointerEvent) => {
          o.onPressStart?.(event);
          return (endEvent: PointerEvent) => o.onPressEnd?.(endEvent);
        });
        if (typeof pc === 'function') c.push(pc);
      }
    }).catch(() => {});
  }
  if (o?.drag) {
    for (const el of els) {
      if (typeof el === 'object' && el && 'style' in el && 'addEventListener' in el) {
        c.push(bindDrag(el as HTMLElement | SVGElement, o));
      }
    }
  }
  return () => {
    disposed = true;
    c.splice(0).forEach(f => f());
  };
}

type DragState = { base?: string[]; rendered?: string; x: number; y: number };
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
    const [left = '0px', top = '0px', z] = state.base ?? [];
    el.style.translate = `${addTranslation(left, state.x)} ${addTranslation(top, state.y)}${z ? ` ${z}` : ''}`;
    state.rendered = el.style.translate;
  };
  const stop = () => {
    release++;
    animations.splice(0).forEach(animation => animation.stop());
  };
  const info = (e: PointerEvent, dx = 0, dy = 0) => ({
    point: { x: e.clientX, y: e.clientY },
    delta: { x: dx, y: dy },
    offset: { x: state.x, y: state.y },
    velocity: { x: x.velocity, y: y.velocity },
  });

  const down = (event: Event) => {
    const e = event as PointerEvent;
    if (pointerId !== undefined) return;
    stop();
    const current = parseTranslation(typeof getComputedStyle === 'undefined' ? el.style.translate : getComputedStyle(el).translate);
    if (state.rendered === undefined || !matchesTranslation(current, parseTranslation(state.rendered))) {
      state.base = current;
      state.rendered = undefined;
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

    loadMotion().then(({ animate }: typeof import('motion')) => {
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
      if (!snapToOrigin) return;
      state.x = state.y = 0;
      render();
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

function matchesTranslation(current: string[], rendered: string[]): boolean {
  const normalize = (axes: string[]) => [0, 1, 2].map(i => {
    const axis = axes[i] ?? '0px';
    return /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?px$/i.test(axis) ? Number(axis.slice(0, -2)) : axis;
  });
  const a = normalize(current), b = normalize(rendered);
  if (a.every(axis => typeof axis === 'number') && b.every(axis => typeof axis === 'number')) {
    return a.every((axis, i) => Math.abs(axis - b[i]) < 0.5);
  }
  return a.every((axis, i) => axis === b[i]);
}

function parseTranslation(value: string): string[] {
  if (!value || value === 'none') return [];
  const axes: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ' ' && !depth) {
      axes.push(value.slice(start, i));
      start = i + 1;
    }
  }
  axes.push(value.slice(start));
  return axes;
}

function addTranslation(base: string, offset: number): string {
  if (!offset) return base;
  return base.endsWith('px') ? `${Number(base.slice(0, -2)) + offset}px` : `calc(${base} + ${offset}px)`;
}

function pathTemplate(d: string): string {
  return d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, '#').replace(/[\s,]/g, '');
}

function sampleMorphPaths(doc: Document, paths: [string, string]): [string, string] {
  const measure = (d: string) => {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    return { path, length: path.getTotalLength() };
  };
  const from = measure(paths[0]);
  const to = measure(paths[1]);
  const count = Math.max(2, Math.ceil(Math.max(from.length, to.length) / 3) + 1);
  const sample = ({ path, length }: ReturnType<typeof measure>) => Array.from({ length: count }, (_, i) => {
    // At exactly zero, an empty leading subpath can return its move point instead of the outline.
    const { x, y } = path.getPointAtLength(Math.max(Number.EPSILON, i / (count - 1)) * length);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(3)}`;
  }).join(' ');
  return [sample(from), sample(to)];
}

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

export const svg = {
  motionPath(targets: MorphTargets, path: string | SVGGeometryElement, options: MorphMotionPathOptions = {}): MorphControls {
    if (typeof window === 'undefined' || typeof document === 'undefined') return mkd();

    let geometry: SVGGeometryElement | null;
    let length: number;
    try {
      geometry = typeof path === 'string' ? document.querySelector<SVGGeometryElement>(path) : path;
      if (typeof geometry?.getTotalLength !== 'function' || typeof geometry.getPointAtLength !== 'function') {
        return mkd();
      }
      length = geometry.getTotalLength();
    } catch {
      return mkd();
    }
    if (!Number.isFinite(length) || length <= 0) return mkd();

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
    return createDeferred(() => loadAnime().catch(() => undefined), (a) => {
      if (!a) return mkd();
      let elements: Element[];
      try {
        const groups = Array.isArray(targets) ? targets.flat(Infinity) : [targets];
        elements = a.utils.$(groups.flatMap<Node | typeof groups[number]>(target =>
          typeof NodeList !== 'undefined' && target instanceof NodeList ? Array.from(target) : [target]));
      } catch {
        return mkd();
      }
      if (!elements.length) return mkd();
      return wrap(a.animate(progressTarget(elements), toAnimeOptions({ progress: [0, 1] }, { ...timing, ease })), 'a');
    });
  },

  draw(t: MorphTargets, o?: MorphSvgOptions): MorphControls {
    const ir = o?.direction === 'reverse' || o?.direction === 'alternate-reverse';
    const els = typeof t === 'string' && typeof document !== 'undefined' ? Array.from(document.querySelectorAll(t)) : Array.isArray(t) || (typeof NodeList !== 'undefined' && t instanceof NodeList) ? Array.from(t as any) : [t];
    const lengths = new Map(els.map((el: any) => {
      if (!el?.getTotalLength) return [el, 500];
      const len = el.getTotalLength();
      el.style.strokeDasharray = `${len}`;
      el.setAttribute('stroke-dasharray', `${len}`);
      return [el, len];
    }));
    const length = (el: unknown) => lengths.get(el) ?? 500;
    if (o?.engine === 'gsap') {
      return createDeferred(loadDrawSVG, ({ gsap, DrawSVGPlugin }) => {
        const v = toGsapOptions({}, o);
        const offset = (_: number, el: unknown) => length(el);
        return DrawSVGPlugin ? wrap(ir ? gsap.to(t, { drawSVG: 0, ...v }) : gsap.from(t, { drawSVG: 0, ...v }), 'g') : wrap(gsap.fromTo(els, { strokeDashoffset: ir ? 0 : offset }, { strokeDashoffset: ir ? offset : 0, ...v }), 'g');
      });
    }
    const offsets = ir ? [0, length] : [length, 0];
    return createDeferred(loadAnime, (a) => wrap(a.animate(els, toAnimeOptions({ strokeDashoffset: offsets }, o)), 'a'));
  },
  morph(t: MorphTargets, o: MorphSvgOptions & { d: [string, string] }): MorphControls {
    const { d, ...ao } = o;
    if (o?.engine === 'gsap' || o?.morphPrecision !== undefined) {
      return createDeferred(loadMorphSVG, ({ gsap, MorphSVGPlugin }) => {
        const v = toGsapOptions({}, ao);
        if (MorphSVGPlugin) { v.morphSVG = { shape: d[1] }; return wrap(gsap.to(t, v), 'g'); }
        v.attr = { d: d[1] }; return wrap(gsap.to(t, v), 'g');
      });
    }
    return createDeferred(loadAnime, (a) => {
      const paths = typeof document !== 'undefined' && pathTemplate(d[0]) !== pathTemplate(d[1])
        ? sampleMorphPaths(document, d)
        : d;
      return wrap(a.animate(t, toAnimeOptions({ d: paths }, ao)), 'a');
    });
  },
  attr(t: MorphTargets, att: Record<string, any>, o?: MorphAnimationOptions): MorphControls {
    if ((o as any)?.engine === 'gsap') return createDeferred(loadGsapCore, ({ gsap }) => wrap(gsap.to(t, { attr: att, ...toGsapOptions({}, o) }), 'g'));
    return createDeferred(loadAnime, (a) => wrap(a.animate(t, toAnimeOptions(att, o)), 'a'));
  }
};
