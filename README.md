# 🪄 MorphJS

<div align="center">

**The shortest, easiest animation engine for modern web apps.**  
*Combines the GPU spring/gesture power of **Motion.js** with the timeline/SVG wizardry of **Anime.js v4**.*

[![Version](https://img.shields.io/npm/v/morphjs?style=flat-square&color=6366f1)](https://www.npmjs.com/package/morphjs)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-2.91%20KB%20gzip-10b981?style=flat-square)](https://bundlephobia.com/package/morphjs)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## 💡 Why MorphJS?

Modern web animation is fragmented:
- **Motion.js** is the gold standard for springs, gesture physics, and WAAPI scroll tracking, but its vanilla JS library can be verbose.
- **Anime.js** is legendary for timelines, SVG morphing, and staggering, but relies heavily on rAF (requestAnimationFrame) without WAAPI/GPU enhancements.

**MorphJS** merges both engines into the absolute shortest, most unified API available.

| Engine | Typical Tween Syntax | Keystrokes |
|:---|:---|:---:|
| **GSAP** | `gsap.to('.box', { x: 100, duration: 0.5 })` | 42 chars |
| **Motion** | `animate('.box', { x: 100 }, { duration: 0.5 })` | 47 chars |
| **Anime.js** | `animate('.box', { x: 100, duration: 500 })` | 43 chars |
| **MorphJS** | **`morph('.box', { x: 100 }, 0.5)`** | **31 chars** |

---

## 📦 Packages & Flavors

MorphJS comes in multiple packages tailored to your architecture:

1. **`morph-stripped`** (*Recommended!*)
   The "Ponytail" optimized edition. Combines both native engines (`motion` and `animejs`) directly. Zero boilerplate, zero adapter registries, zero global state managers.
   - **Size:** `10.01 KB raw` / `2.91 KB gzip`
2. **`morphjs`** (Core)
   The full-featured extensible version with dynamic adapter registries, global state tracking, and event lifecycle buses.
   - **Size:** `24.24 KB raw` / `6.63 KB gzip`

### Framework Bindings
- **`@morphjs/react`**: `useAnimate`, `useMorphSpring`, `useGesture`, `<MorphPresence>`
- **`@morphjs/vue`**: `useMorph`, `useMorphSpring`, `v-morph`, `<MorphTransition>`
- **`@morphjs/svelte`**: `morphAction`, `gesture`, `morphTransition`, `springStore`
- **`@morphjs/tanstack`**: Virtual/Table routing and transitions

---

## 🚀 Quick Start (API)

```ts
import morph, { timeline, spring, stagger, scroll, gesture, svg } from 'morph-stripped';

// 1. One-Liner (Fast CSS Tween)
morph('.box', { x: 100, rotate: 180 }, 0.5);

// 2. Spring Physics (Chained peaks supported!)
spring('.ball', { scale: [1, 1.2, 1] }, { stiffness: 400, damping: 10 });

// 3. Timelines (Fluent Chaining)
const tl = timeline({ autoplay: true })
  .add('.header', { opacity: 1, y: 0 }, 0.5)
  .add('.card', { scale: 1 }, '-=0.2');

// 4. Stagger (Grid, Center, Random)
morph('.grid-item', { scale: 1 }, {
  delay: stagger(0.1, { from: 'center' })
});

// 5. Scroll Tracking
scroll(
  (progress) => console.log(progress), 
  { target: document.querySelector('.container') }
);

// 6. Gestures (Hover, Press, Drag)
gesture('.draggable', {
  drag: true,
  hover: true,
  onDrag: (e, info) => console.log(info.offset.x)
});

// 7. SVG Draw & Morph
svg.draw('.my-path', { duration: 1.5 });
svg.morph('.my-path', { d: ['M...', 'M...'], duration: 1 });
```

---

## 💻 Interactive Playground

To test all the capabilities of MorphJS (Gestures, Springs, Timelines, Staggers, SVGs, and Framework integrations), run the local playground:

```bash
pnpm install
pnpm --filter @morphjs/playground dev
```

Visit `http://localhost:5174/` to see the engine in action.

---

## 🏗 Architecture

MorphJS intelligently routes properties to the most optimal native engine under the hood:
- **Motion.js** handles: Tweens, Springs, Scroll, Gestures.
- **Anime.js** handles: Timelines, Staggering, SVG Path Morphing, SVG Stroke Drawing.

All of this happens invisibly behind the single `morph` API.

## License
MIT
