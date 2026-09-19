# AGENT.md: Machine-Actionable Guide for AI Agents

> **Note**: This file is maintained alongside [AGENTS.md](file:///d:/Project%20Trae/morphjs/AGENTS.md). Refer to [AGENTS.md](file:///d:/Project%20Trae/morphjs/AGENTS.md) for the complete, canonical agentic guide.

---

## Quick Reference for AI Agents

### Essential Commands
- **Install**: `pnpm install`
- **Typecheck**: `pnpm typecheck`
- **Run Tests**: `pnpm test`
- **Build**: `pnpm build`
- **Lint**: `pnpm lint`
- **Playground**: `pnpm --filter @morphjs/playground dev`

### Golden Rules for MorphJS Code Changes
1. **SSR / Node Runtime Boundary**: Never access `window`, `document`, or `NodeList` without checking `typeof` guards first. Vitest executes in a Node environment without DOM globals.
2. **Library Exports Matching**: Vite builds `dist/index.js` (ESM) and `dist/index.cjs` (CJS). Ensure `main`, `module`, and `exports` in each `package.json` align with these files.
3. **Tri-Engine Routing**:
   - `Motion.js`: WAAPI compositor transitions, springs, gestures.
   - `Anime.js v4`: Lightweight timelines, SVG paths, staggers.
   - `GSAP v3`: ScrollTrigger pinning/scrubbing, complex vertex morphing.
4. **Verification Requirement**: Always run `pnpm typecheck && pnpm test && pnpm build` to verify any modifications before completing a task.

See [AGENTS.md](file:///d:/Project%20Trae/morphjs/AGENTS.md) for detailed architecture, directory topologies, and self-healing playbooks.
