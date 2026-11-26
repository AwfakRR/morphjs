<div align="center">

<img src=".github/assets/MorphJS.png" alt="MorphJS Logo" width="160" />

# MorphJS

**The shortest, easiest animation engine for modern web apps.**  
*Combines the GPU spring/gesture power of **Motion.js**, the lightweight timeline/SVG magic of **Anime.js v4**, and the heavy-duty specialist muscle of **GSAP v3**.*

[![Version](https://img.shields.io/npm/v/morphjs?style=flat-square&color=6366f1)](https://www.npmjs.com/package/morphjs)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-~7%20KB%20gzip-10b981?style=flat-square)](https://bundlephobia.com/package/morph-stripped)
[![AI Agents](https://img.shields.io/badge/AI%20Agents-AGENTS.md-6366f1?style=flat-square)](AGENTS.md)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## 💡 Why MorphJS?

Modern web animation is fragmented:
- **Motion.js** is unmatched for physical springs and WAAPI compositor transforms, but vanilla JS usage can be verbose.
- **Anime.js v4** is legendary for compact UI timelines, SVG drawing, and staggers, but lacks native spring physics.
- **GSAP v3** is the industry powerhouse for ScrollTrigger pinning and complex vertex morphing, but carries a heavy ~35–45 KB bundle and non-standard commercial licensing.

**MorphJS** unites all three into the absolute shortest, most unified animation API on the web.

| Engine | Typical Tween Syntax | Keystrokes |
|:---|:---|:---:|
| **GSAP** | `gsap.to('.box', { x: 100, duration: 0.5 })` | 42 chars |
| **Motion** | `animate('.box', { x: 100 }, { duration: 0.5 })` | 47 chars |
| **Anime.js** | `animate('.box', { x: 100, duration: 500 })` | 43 chars |
| **MorphJS** | **`morph('.box', { x: 100 }, 0.5)`** | **31 chars** |

---

## 📦 Packages & Flavors

MorphJS comes in two editions tailored to your architecture:

1. **`morph-stripped`** (*Recommended*)  
   The streamlined, zero-overhead edition. Direct unified engine loaders with zero adapter registries and zero global state managers.
   - **Size:** `~23 KB raw` / `~7 KB gzip` (ESM)
2. **`morphjs`** (Core)  
   The full-featured extensible edition with dynamic adapter plugins, lifecycle event buses, and global state tracking.
   - **Size:** `~35 KB raw` / `~9 KB gzip`

### Framework Bindings
- **`@morphjs/react`**: `useAnimate`, `useMorphScope`, `useMorphSpring`, `useGesture`, `<MorphPresence>`
- **`@morphjs/vue`**: `useMorph`, `useMorphSpring`, `v-morph`, `<MorphTransition>`
- **`@morphjs/svelte`**: `morphAction`, `morphScope`, `gesture`, `morphTransition`, `springStore`
- **`@morphjs/tanstack`**: Route transitions, table row reordering, virtual list animations

---

## ⚡ Quick Start (API)

```ts
import morph, { timeline, spring, stagger, scroll, gesture, svg } from 'morph-stripped';

// 1. One-Liner (Ultra-fast WAAPI CSS Tween via Motion)
morph('.box', { x: 100, rotate: 180 }, 0.5);

// 2. Spring Physics (Analytical spring solver via Motion)
spring('.ball', { scale: [1, 1.2, 1] }, { stiffness: 400, damping: 10 });

// 3. Timelines (Default lightweight Anime.js v4 timeline)
const tl = timeline({ autoplay: true })
  .add('.header', { opacity: 1, y: 0 }, 0.5)
  .add('.card', { scale: 1 }, '-=0.2');

// 4. Stagger (Grid, Center, Random)
morph('.grid-item', { scale: 1 }, {
  delay: stagger(0.1, { from: 'center' })
});

// 5. Scroll Tracking (Lightweight WAAPI or GSAP ScrollTrigger)
// Basic scroll tracking via Motion.js:
scroll((progress) => console.log(progress));

// Advanced ScrollTrigger (auto-activated when pinning or scrubbing):
scroll('.parallax', { pin: true, scrub: true });

// 6. Interactive Gestures (Drag, Hover, Press via Pointer Events + Motion)
gesture('.draggable', {
  drag: { constraints: { left: -100, right: 100, top: 0, bottom: 0 }, momentum: true },
  hover: true,
  onDrag: (e, info) => console.log(info.offset.x)
});

// 7. SVG Draw & Morph (Anime.js default, GSAP MorphSVG for complex shapes)
svg.draw('.my-path', { duration: 1.5 });
svg.morph('.my-path', { d: ['M...', 'M...'], duration: 1 });

// 8. Layout FLIP Transitions (in `morphjs` core)
import { flip } from 'morphjs';
flip('.card', () => container.classList.toggle('grid'), { duration: 0.4, ease: 'easeOut' });
// Or two-step for framework/async DOM updates:
const state = flip.capture('.card');
reorderCards();
flip.from(state, { duration: 0.4, spring: true });
```

Drag limits are signed pixel offsets from the element's starting position; omitted sides are unbounded. The element stays where you leave it by default. Set `momentum: true` to glide within the limits, or `snapToOrigin: true` to spring back to the start instead (snap takes precedence). Drag callbacks report the current offset in pixels and pointer velocity in pixels per second.

In `morphjs` (core), reduced motion disables the glide and makes snap-to-origin immediate.

### Animation Scopes

In the full `morphjs` package, group animations and subscriptions for cleanup:

```ts
import morph from 'morphjs';

const scope = morph.scope(); // or import and call createScope()
scope.animate('.card', { opacity: [0, 1] }, 0.5);
scope.gesture('.card', { hover: true });
scope.revert(); // cancel tracked animations and remove listeners on teardown
```

Scopes also track `spring`, `timeline`, `scroll`, and `svg` calls. Use `scope.add(controlsOrCleanup)` to register your own cleanup. You can reuse the scope after calling `revert()`.

- **React:** `useMorphScope()` reverts the scope on unmount. `useAnimate()` also cancels its animations on unmount.
- **Vue:** Call `useMorph()` in setup to get animation methods that clean up on unmount.
- **Svelte:** Call `morphScope()` during component initialization to revert the scope on destroy.

---

## 🏗️ Architecture: Balanced & Agnostic

No single engine dominates. MorphJS automatically routes each animation to the engine best equipped for the job:

```
┌────────────────────────────────────────────────────────┐
│                  MorphJS Unified API                   │
│   animate() · spring() · timeline() · scroll()         │
│   gesture() · stagger() · svg.draw/morph/attr · flip() │
└───────────┬────────────────┬───────────────────────────┘
            │                │
      ┌─────▼──────┐   ┌─────▼──────┐   ┌────────────┐
      │  Motion.js │   │ Anime.js v4│   │  GSAP v3   │  ← All lazy-loaded
      │   (WAAPI)  │   │   (rAF)    │   │  (Special) │
      └────────────┘   └────────────┘   └────────────┘
      • Springs        • Default TL     • ScrollTrigger (pin/scrub)
      • Gestures       • SVG Draw/Attr  • MorphSVG (mismatched points)
      • CSS Tweens     • Staggers       • Pro Nested Timelines
      • Basic Scroll   • 100% MIT       • Opt-in ({ engine: 'gsap' })
```

* **All engines are lazy-loaded**: If your project never uses GSAP features, **0 bytes** of GSAP are bundled or downloaded.
* **Seamless Fallbacks**: If an optional peer dependency is omitted, MorphJS gracefully degrades to the next available engine.

---

## 🤖 Built for AI & Agentic Coding

MorphJS is purpose-built for the era of AI coding agents (Trae, Cursor, Copilot, Claude Code, Antigravity, Devin):

- **Ultra-Low Token Overhead**: With the shortest animation syntax on the web (`morph('.box', { x: 100 }, 0.5)`), AI coding assistants generate animations with ~30% fewer tokens, reducing latency and virtually eliminating hallucinated parameter keys.
- **Unified Mental Model**: LLMs no longer have to juggle conflicting APIs for physics springs (Motion), SVG/timelines (Anime.js), or ScrollTrigger (GSAP). One intuitive API handles all workloads with automatic engine delegation.
- **Machine-Actionable Agent Protocols**: Includes pre-configured [`AGENTS.md`](AGENTS.md) and [`AGENT.md`](AGENT.md) specification files containing deep architectural topology, strict SSR/Node runtime boundary rules, and self-healing playbooks.
- **Strict Type Inference**: Zero-shot autocompletion for AI prompts via exhaustive TypeScript contracts, discriminated unions, and JSDoc annotations across all framework bindings.

---

### Scroll reveals

Use `scroll.inView` when an effect should start on entry rather than follow scroll progress. Both `morphjs` and `morph-stripped` expose it on the named `scroll` export and on `morph.scroll`.

```ts
import { scroll } from 'morph-stripped';

const stop = scroll.inView('.reveal', (element) => {
  element.classList.add('is-revealed');
}, { threshold: 0.25 });

// Call stop() when the component unmounts to stop observing.
```

Pass a selector, a DOM element, or a collection of elements. By default the callback runs once per element when it intersects the viewport. Use `once: false` to fire on each re-entry, `container` to observe within a scrollable element, and `margin` (the observer's root margin) to adjust the trigger boundary. `threshold` is the fraction of the target that must intersect, from 0 to 1 (default 0).

The trigger doesn't animate or hide content on its own. Keep content visible by default and apply reveal motion only under `@media (prefers-reduced-motion: no-preference)`. On the server or in browsers without `IntersectionObserver`, registration returns a no-op cleanup and never calls the callback.

## 🎮 Interactive Playground

Try gestures, springs, timelines, staggers, SVGs, scroll tracking, and scroll reveals live:

```bash
pnpm install
pnpm --filter @morphjs/playground dev
```

Visit `http://localhost:5173/` to see the playground in action.

---

## 📄 License

[MIT](LICENSE) © MorphJS Contributors
