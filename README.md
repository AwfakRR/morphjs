<div align="center">

<img src=".github/assets/MorphJS.png" alt="MorphJS Logo" width="160" />

# MorphJS

**The shortest, easiest animation engine for modern web apps.**  
*Combines the GPU spring/gesture power of **Motion.js**, the lightweight timeline/SVG magic of **Anime.js v4**, and the heavy-duty specialist muscle of **GSAP v3**.*

[![Workspace Version](https://img.shields.io/badge/workspace-0.1.0-6366f1?style=flat-square)](#-packages--flavors)
![Morph Stripped Bundle Size](https://img.shields.io/badge/bundle%20size-~12%20KB%20gzip-10b981?style=flat-square)
[![AI Agents](https://img.shields.io/badge/AI%20Agents-AGENTS.md-6366f1?style=flat-square)](AGENTS.md)

</div>

---

## 💡 Why MorphJS?

Modern web animation is fragmented:
- **Motion.js** is unmatched for physical springs and WAAPI compositor transforms, but vanilla JS usage can be verbose.
- **Anime.js v4** is legendary for compact UI timelines, SVG drawing, and staggers.
- **GSAP v3** is the industry powerhouse for ScrollTrigger pinning and complex vertex morphing.

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

1. **[`morph-stripped`](packages/morph-stripped)** (*Recommended for a minimal API*)

   The streamlined, zero-overhead edition. Direct unified engine loaders with zero adapter registries and zero global state managers.
   - **Size:** `~38 KB raw` / `~12 KB gzip` (ESM)
2. **[`morphjs`](packages/core)** (Core)

   The full-featured extensible edition with dynamic adapter plugins, lifecycle events, global state tracking, animation scopes, and layout FLIP.

### Framework Bindings
- **[`@morphjs/react`](packages/react)**: `useAnimate`, `useMorphScope`, `useMorphSpring`, `useGesture`, `<MorphPresence>`
- **[`@morphjs/vue`](packages/vue)**: `useMorph`, `useMorphSpring`, `vMorph` (`v-morph`), `<MorphTransition>`, and `MorphPlugin` to register the directive and component.
- **[`@morphjs/svelte`](packages/svelte)**: `morphAction`, `morphScope`, `gesture`, `morphTransition`, `springStore`
- **[`@morphjs/tanstack`](packages/tanstack)**: `createRouteTransition(options?)` for route enter/exit, `createTableTransition(options?)` for row entrances and cell highlights, and `createVirtualItemTransition(options?)` for virtual item entrances.

The bindings depend on the core edition. These are workspace package names, not public npm install targets: the public `morphjs` listing is an unrelated package. To build MorphJS from source, clone this repository, then run `pnpm install --frozen-lockfile` and `pnpm build` from its root.

---

## ⚡ Quick Start (API)

```ts
import morph, { timeline, spring, stagger, scroll, svg } from 'morph-stripped';

// 1. One-Liner (Ultra-fast WAAPI CSS Tween via Motion)
morph('.box', { x: 100, rotate: 180 }, 0.5);

// 2. Spring Physics (Analytical spring solver via Motion)
spring('.ball', { scale: [1, 1.2, 1] }, { stiffness: 400, damping: 10 });

// 3. Timelines (Default lightweight Anime.js v4 timeline)
const tl = timeline({ defaults: { duration: 0.5 } })
  .add('.header', { opacity: [0, 1], y: [20, 0] })
  .add('.card', { scale: [0.9, 1] }, '-=0.2');

// 4. Stagger (Grid, Center, Random)
morph('.grid-item', { scale: 1 }, {
  delay: stagger(0.1, { from: 'center' })
});

// 5. Scroll Tracking (Lightweight WAAPI or GSAP ScrollTrigger)
// Basic scroll tracking via Motion.js:
scroll((progress) => console.log(progress));

// Pin a section and scrub a tween with GSAP ScrollTrigger:
const parallax = document.querySelector<HTMLElement>('.parallax');
if (parallax) {
  const animation = morph('.parallax-content', { y: [0, -100] }, { autoplay: false });
  scroll(animation, { target: parallax, pin: true, scrub: true });
}

// 6. SVG Drawing and Morphing
svg.draw('#outline', { duration: 1.5 });
svg.morph('#shape', { d: ['M0 0 L50 0 L25 50 Z', 'M0 0 L60 0 L30 30 Z'], duration: 1 });
```

`morph(targets, properties, durationOrOptions?)` is shorthand for `animate()`. Durations, delays, and numeric timeline offsets are in seconds; the third argument to `timeline.add(targets, properties, offset?)` is a position, not a duration.

### Drag constraints, momentum, and snapping

```ts
import { gesture } from 'morph-stripped';

const stopDrag = gesture('.draggable', {
  drag: { constraints: { left: -100, right: 100, top: 0, bottom: 0 }, momentum: true },
  hover: true,
  onDrag: (_event, info) => console.log(info.offset.x),
});

const stopSnap = gesture('.spring-back', { drag: { snapToOrigin: true } });
// Call stopDrag() and stopSnap() on teardown.
```

Both editions support drag, hover, and press via pointer events. Drag limits are signed pixel offsets from the element's starting position; omitted sides are unbounded. The element stays where you leave it by default. Set `momentum: true` to glide within the limits, or `snapToOrigin: true` to spring back to the start instead (snap takes precedence). Drag callbacks report the current offset in pixels and pointer velocity in pixels per second.

In `morphjs` (core), reduced motion disables the glide and makes snap-to-origin immediate.

### SVG path following

```ts
import { svg } from 'morph-stripped';

svg.motionPath('.marker', '#track', {
  duration: 2, ease: 'easeInOut', delay: 0.2, repeat: 1,
  start: 0.1, end: 0.9, autoRotate: true,
});
```

In both editions, `svg.motionPath(targets, path, options?)` (also `morph.svg.motionPath`) returns standard `MorphControls`. Pass an SVG geometry element or its selector as the path. `start` and `end` are fractions of the path length (default `0` and `1`, clamped to that range); swap them to travel backwards. `autoRotate` defaults to `false`; when enabled, it points the target's positive x-axis along the path's tangent in the direction of increasing path length. Motion is linear by default; `duration` and `delay` are in seconds.

The helper applies the path's local x/y coordinates as CSS translations, so align the target's starting origin with the path's coordinate origin. For example, use an SVG marker drawn around `(0, 0)` in the same coordinate space, or an HTML marker positioned at the origin of a 1:1 path viewport. Path and ancestor transforms are not converted across coordinate spaces. This helper loads Anime.js on demand; install `animejs` to use it.

With `autoRotate` enabled, the transform list applies the path translation, the target's original translation (such as a centering offset), the tangent rotation, and then the rest of the original transform. This keeps centering offsets from swinging off the path and prevents existing scale from distorting the tangent. Inline or stylesheet transforms are captured when the animation starts; apply live effects (for example, a hover rotation) to a child of the path-following target.

### Layout FLIP transitions

In core, `flip(targets, mutate, options?)` (also `morph.flip`) captures element positions, runs a synchronous DOM update, then animates to the new layout:

```ts
import { flip } from 'morphjs';

flip('.card', () => {
  document.querySelector('.cards')?.classList.toggle('grid');
}, { duration: 0.4, ease: 'easeOut' });
```

For framework or async DOM updates, call `flip.capture(targets)` before the update and `flip.from(state, options?)` after the DOM has settled. Both playback forms return `MorphControls` and accept a duration shorthand in seconds. Use `scale: false` to animate movement without sizing, `fade: true` to animate opacity changes, or `spring: true` (or spring settings) for spring motion. With `flip.from()`, pass `targets` to match replacement elements using the same `data-flip-id`. By default the animation restores the prior inline transform on completion; set `prune: false` to opt out.

### Animation Scopes

In the full `morphjs` package, group animations and subscriptions for cleanup:

```ts
import morph from 'morphjs';

const scope = morph.scope(); // or import and call createScope()
scope.animate('.card', { opacity: [0, 1] }, 0.5);
scope.gesture('.card', { hover: true });
// Call scope.revert() on teardown to cancel tracked animations and remove listeners.
```

Scopes also track `spring`, `timeline`, scroll tracking, and `svg.draw`, `svg.morph`, and `svg.attr`. Use `scope.add(controlsOrCleanup)` to track other work, for example `scope.add(scroll.inView(target, onEnter))` using the standalone `scroll` export. You can reuse the scope after calling `revert()`. A scope tracks lifetimes; it does not limit selectors to a DOM subtree.

- **React:** `useMorphScope()` reverts the scope on unmount. `useAnimate()` returns a `[ref, animate]` tuple, limits string selectors to that ref's subtree, and cancels its animations on unmount.
- **Vue:** Call `useMorph()` in setup to get animation methods that clean up on unmount.
- **Svelte:** Call `morphScope()` during component initialization to revert the scope on destroy.

### Nested timelines and labels in `morph-stripped`

```ts
import { timeline } from 'morph-stripped';

const reveal = timeline({ autoplay: false })
  .add('.card', { opacity: [0, 1], duration: 1 });

const sequence = timeline({ autoplay: false })
  .label('intro', 0.5) // addLabel() is an alias
  .add(reveal, 'intro+=0.25');

sequence.seek('intro+=0.75'); // 1.25 s on the parent, halfway through reveal
// sequence.play('intro'); // start playing from the label
```

Numeric positions and label offsets are in seconds. The parent drives a nested
timeline's playhead; a child can be attached to only one parent. Build the
child before adding it, and define labels on the timeline that uses them. Core timelines have `label()` but do not support adding a timeline as a child or passing labels to `seek()` and `play()`.
Nesting and labels work with the default Anime.js engine and with `engine: 'gsap'`.
Percentage offsets (such as `+=50%`) are only supported within the same engine; for mixed engines use an absolute or label offset (`add()` throws if both engines are known, otherwise it logs an error and skips the child once they resolve).

### Scroll reveals

Use `scroll.inView` when an effect should start on entry rather than follow scroll progress. Both editions expose it on the named `scroll` export and on `morph.scroll`.

```ts
import { scroll } from 'morph-stripped';

const stop = scroll.inView('.reveal', (element) => {
  element.classList.add('is-revealed');
}, { threshold: 0.25 });

// Call stop() when the component unmounts to stop observing.
```

Pass a selector, a DOM element, or an array-like collection of elements. The callback receives the element and its `IntersectionObserverEntry`. It runs once per element by default; set `once: false` to fire on each re-entry. Use `container` to observe within a scrollable element and `margin` (the observer's root margin) to adjust the trigger boundary. `threshold` is the fraction of the target that must intersect, from 0 to 1 (default 0).

The trigger doesn't animate or hide content on its own. Keep content visible by default and apply reveal motion only under `@media (prefers-reduced-motion: no-preference)`. On the server or in browsers without `IntersectionObserver`, registration returns a no-op cleanup and never calls the callback.

### Cubic Bézier easing

Both editions accept `ease: [x1, y1, x2, y2]`. When Anime.js or GSAP asks the same easing function for the same progress consecutively, MorphJS reuses the last sample. There is no new option to enable.

```ts
import morph from 'morph-stripped';

morph('.card', { x: [0, 100], opacity: [0, 1] }, {
  engine: 'anime', duration: 0.5, ease: [0.2, 0.8, 0.6, 1],
});
```

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
      • CSS Tweens     • Staggers       • Nested Timelines
                       • Nested Timelines
      • Basic Scroll                    • Opt-in ({ engine: 'gsap' })
```

* **Engines load on demand**: The library keeps engine imports external. An app bundler may emit separate engine chunks; an engine isn't loaded until a code path requests it.
* **Optional peer dependencies**: Provide Motion (`motion` 11+), Anime.js (`animejs` 4+), or GSAP (`gsap` 3.12+) for the features you use. Some paths can fall back if an engine is unavailable, but not every operation has an engine-independent fallback.

---

## 🤖 Built for AI & Agentic Coding

MorphJS is purpose-built for the era of AI coding agents (Trae, Cursor, Copilot, Claude Code, Antigravity, Devin):

- **Ultra-Low Token Overhead**: With the shortest animation syntax on the web (`morph('.box', { x: 100 }, 0.5)`), AI coding assistants generate animations with ~30% fewer tokens, reducing latency and virtually eliminating hallucinated parameter keys.
- **Unified Mental Model**: LLMs no longer have to juggle conflicting APIs for physics springs (Motion), SVG/timelines (Anime.js), or ScrollTrigger (GSAP). One intuitive API handles all workloads with automatic engine delegation.
- **Machine-Actionable Agent Protocols**: Includes pre-configured [`AGENTS.md`](AGENTS.md) and [`AGENT.md`](AGENT.md) specification files containing deep architectural topology, strict SSR/Node runtime boundary rules, and self-healing playbooks.
- **Strict Type Inference**: Zero-shot autocompletion for AI prompts via exhaustive TypeScript contracts, discriminated unions, and JSDoc annotations across all framework bindings.

---

## 🎮 Interactive Playground

Try gestures, springs, timelines, staggers, SVGs, scroll tracking, and scroll reveals live:

```bash
pnpm install --frozen-lockfile
pnpm --filter @morphjs/playground dev
```

Visit `http://localhost:5173/` to see the playground in action.

---

## 🛠️ Workspace Commands

Run these from the repository root:

| Command | What it does |
|:---|:---|
| `pnpm build` | Build the workspace packages and playground. |
| `pnpm typecheck` | Type-check the workspace. Run the build first to generate the package declarations. |
| `pnpm test` | Run the full Vitest suite. |
| `pnpm dev` | Run workspace development scripts in parallel. Use the filtered command above to run only the playground. |
| `pnpm lint` | Run `eslint .`. ESLint 9 requires a flat config, which this repository does not currently include. |
