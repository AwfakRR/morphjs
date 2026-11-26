import type {
  MorphTargets, MorphAnimationOptions, MorphSpringOptions, MorphStaggerOptions,
  MorphScrollOptions, MorphGestureOptions, MorphSvgOptions, TimelineOptions,
  MorphControls, MorphTimeline,
} from './types';
import { loadMotion, loadAnime, loadGsapCore, loadScrollTrigger, loadMorphSVG, loadDrawSVG, wrap, createDeferred, toAnimeOptions, toAnimePosition, toGsapOptions, runSpring } from './engine';

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

async function loadGsapFor(...props: Record<string, any>[]) {
  const [gsap] = await Promise.all([
    loadGsapCore(),
    props.some(p => p.scrollTrigger !== undefined) && loadScrollTrigger(),
    props.some(p => p.morphSVG !== undefined) && loadMorphSVG(),
    props.some(p => p.drawSVG !== undefined) && loadDrawSVG(),
  ]);
  return gsap;
}

export function timeline(opt?: TimelineOptions): MorphTimeline {
  const seq: Array<{ t: any; p: any; o?: string | number }> = [];
  let realTl: any = null;
  const useGsap = opt?.engine === 'gsap';
  let activeEngine: 'g' | 'a' = useGsap ? 'g' : 'a';
  let pendingGsapAdd: Promise<void> | undefined;

  const buildAnime = (anime: any) => {
    const tl = anime.createTimeline({
      autoplay: opt?.autoplay ?? true,
      defaults: opt?.defaults ? toAnimeOptions(opt.defaults, undefined, true) : undefined,
    });
    seq.forEach(s => tl.add(s.t, toAnimeOptions(s.p, undefined, true), toAnimePosition(s.o)));
    realTl = tl;
    const controls = wrap(tl, 'a');
    controls.seek = (time) => tl.seek(tl.reversed ? tl.duration - time * 1000 : time * 1000);
    return controls;
  };

  const buildGsap = ({ gsap }: any) => {
    const d: any = {};
    if (opt?.defaults?.duration !== undefined) d.duration = opt.defaults.duration;
    if (opt?.defaults?.ease !== undefined) d.ease = opt.defaults.ease;
    const tl = gsap.timeline({
      paused: opt?.autoplay === false,
      defaults: Object.keys(d).length ? toGsapOptions(d) : undefined,
    });
    seq.forEach(s => tl.to(s.t, toGsapOptions(s.p), s.o));
    realTl = tl;
    return wrap(tl, 'g');
  };

  const ld = useGsap
    ? () => loadGsapFor(...seq.map(s => s.p)).catch(() => { activeEngine = 'a'; return loadAnime(); })
    : () => loadAnime().catch(() => { activeEngine = 'g'; return loadGsapFor(...seq.map(s => s.p)); });

  const deferred = createDeferred(
    () => Promise.resolve().then(ld),
    (m) => activeEngine === 'g' ? buildGsap(m) : buildAnime(m),
  );

  const tlo: MorphTimeline = {
    ...deferred,
    add(t: any, p: any, o?: string | number) {
      if (realTl) {
        if (activeEngine === 'g') {
          const add = () => { realTl.to(t, toGsapOptions(p), o); };
          if (pendingGsapAdd || p.scrollTrigger !== undefined || p.morphSVG !== undefined || p.drawSVG !== undefined) {
            const next = Promise.all([pendingGsapAdd, loadGsapFor(p)]).then(add);
            pendingGsapAdd = next;
            void next.then(() => { if (pendingGsapAdd === next) pendingGsapAdd = undefined; }, () => {});
          } else {
            add();
          }
        } else realTl.add(t, toAnimeOptions(p, undefined, true), toAnimePosition(o));
      } else {
        seq.push({ t, p, o });
      }
      return tlo;
    },
    label(n: string, o?: any) {
      if (realTl && activeEngine === 'g') realTl.addLabel(n, o);
      return tlo;
    },
    addPause(o?: any, c?: any) {
      if (realTl && activeEngine === 'g') realTl.addPause(o, c);
      return tlo;
    },
    get duration() {
      if (!realTl) return 0;
      return activeEngine === 'g' ? (realTl.duration?.() ?? 0) : ((realTl.duration ?? 0) / 1000);
    },
    get currentTime() {
      if (!realTl) return 0;
      return activeEngine === 'g' ? (realTl.time?.() ?? 0) : realTl.iterationCurrentTime / 1000;
    },
    get progress() {
      if (!realTl) return 0;
      return (activeEngine === 'g' ? realTl.progress?.() : realTl.iterationProgress) ?? 0;
    },
  };

  if (opt?.autoplay !== false) {
    Promise.resolve().then(() => tlo.play());
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

export function scroll(a: MorphControls | ((p: number) => void), o?: MorphScrollOptions): MorphControls {
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

export function gesture(t: MorphTargets, o?: MorphGestureOptions): () => void {
  if (typeof window === 'undefined') return () => {};
  const c: any[] = [], els = typeof t === 'string' ? Array.from(document.querySelectorAll(t)) : Array.isArray(t) || t instanceof NodeList ? Array.from(t as any) : [t];
  if (o?.hover || o?.press) {
    loadMotion().then((m: any) => {
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
    });
  }
  if (o?.drag) {
    for (const el of els as any[]) {
      if (!el.addEventListener) continue;
      let a = false, ox = 0, oy = 0, px = 0, py = 0;
      const cb = (y: string, e: any, dx=0, dy=0, tx=0, ty=0) => (o as any)[y]?.(e, { point: {x: e.clientX, y: e.clientY}, delta: {x: dx, y: dy}, offset: {x: tx, y: ty}, velocity: {x: dx, y: dy} });
      const d = (e: any) => { a = true; ox=px=e.clientX; oy=py=e.clientY; el.setPointerCapture?.(e.pointerId); cb('onDragStart', e); };
      const m = (e: any) => { if(!a)return; const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX; py=e.clientY; const tx=e.clientX-ox, ty=e.clientY-oy; el.style.translate=`${tx}px ${ty}px`; cb('onDrag', e, dx, dy, tx, ty); };
      const u = (e: any) => { if(!a)return; a = false; el.releasePointerCapture?.(e.pointerId); cb('onDragEnd', e, 0, 0, px-ox, py-oy); };
      ['down','move','up','cancel'].forEach(e => el.addEventListener(`pointer${e}`, e==='down'?d:e==='move'?m:u));
      c.push(() => ['down','move','up','cancel'].forEach(e => el.removeEventListener(`pointer${e}`, e==='down'?d:e==='move'?m:u)));
    }
  }
  return () => c.forEach(f => f());
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

export const svg = {
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
