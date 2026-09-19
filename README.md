<div align="center">

<img src=".github/assets/MorphJS.png" alt="MorphJS Logo" width="160" />

# MorphJS

**The shortest, easiest animation engine for modern web apps.**  
*Combines the GPU spring/gesture power of **Motion.js**, the lightweight timeline/SVG magic of **Anime.js v4**, and the heavy-duty specialist muscle of **GSAP v3**.*

[![Version](https://img.shields.io/npm/v/morphjs?style=flat-square&color=6366f1)](https://www.npmjs.com/package/morphjs)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-3.94%20KB%20gzip-10b981?style=flat-square)](https://bundlephobia.com/package/morphjs)
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
   - **Size:** `13.23 KB raw` / `3.94 KB gzip`
2. **`morphjs`** (Core)  
   The full-featured extensible edition with dynamic adapter plugins, lifecycle event buses, and global state tracking.
   - **Size:** `31.00 KB raw` / `7.97 KB gzip`

### Framework Bindings
- **`@morphjs/react`**: `useAnimate`, `useMorphSpring`, `useGesture`, `<MorphPresence>`
- **`@morphjs/vue`**: `useMorph`, `useMorphSpring`, `v-morph`, `<MorphTransition>`
- **`@morphjs/svelte`**: `morphAction`, `gesture`, `morphTransition`, `springStore`
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
  drag: true,
  hover: true,
  onDrag: (e, info) => console.log(info.offset.x)
});

// 7. SVG Draw & Morph (Anime.js default, GSAP MorphSVG for complex shapes)
svg.draw('.my-path', { duration: 1.5 });
svg.morph('.my-path', { d: ['M...', 'M...'], duration: 1 });
```

---

## 🏗️ Architecture: Balanced & Agnostic

No single engine dominates. MorphJS automatically routes each animation to the engine best equipped for the job:

```
┌────────────────────────────────────────────────────────┐
│                  MorphJS Unified API                   │
│   animate() · spring() · timeline() · scroll()         │
│   gesture() · stagger() · svg.draw/morph/attr          │
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

## 🎮 Interactive Playground

Test every capability live (Gestures, Springs, Timelines, Staggers, SVGs, and ScrollTrigger):

```bash
pnpm install
pnpm --filter @morphjs/playground dev
```

Visit `http://localhost:5173/` to see the playground in action.

---

## 📄 License

[MIT](LICENSE) © MorphJS Contributors
