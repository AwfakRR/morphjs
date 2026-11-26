import 'animejs';
import 'gsap';
import { setImmediate } from 'node:timers/promises';

// From the workspace root after pnpm build: node packages/core/benchmarks/bezier-sampling.mjs
globalThis.window = {};
globalThis.document = {};
globalThis.Element = class {};
globalThis.NodeList = class {};

const ease = [0.2, 0.8, 0.6, 1.4];
const frames = 2000;
const frameTime = index => (index % 239 + 1) / 240;

for (const edition of ['core', 'morph-stripped']) {
  const { animate } = await import(`../../${edition}/dist/index.js`);
  for (const [engine, targetCount, propertyCount] of [
    ['anime', 1, 1], ['anime', 64, 6], ['gsap', 1, 1], ['gsap', 64, 6],
  ]) {
    const properties = Object.fromEntries(
      Array.from({ length: propertyCount }, (_, index) => [`value${index}`, 100]),
    );
    const targets = Array.from({ length: targetCount }, () =>
      Object.fromEntries(Object.keys(properties).map(key => [key, 0])),
    );
    const controls = animate(targets, properties, { engine, duration: 1, autoplay: false, ease });
    try {
      const deadline = performance.now() + 2000;
      while (controls.duration !== 1) {
        if (performance.now() > deadline) throw new Error(`${engine} did not initialize`);
        await setImmediate();
      }
      controls.seek(0.5);
      if (Math.abs(targets.at(-1).value0 - 102.49903) > 0.001) {
        throw new Error(`${engine} did not render the tuple ease`);
      }

      const sample = () => {
        const start = performance.now();
        for (let index = 0; index < frames; index++) controls.seek(frameTime(index));
        return performance.now() - start;
      };
      for (let index = 0; index < 3; index++) sample();
      const samples = Array.from({ length: 9 }, sample).sort((a, b) => a - b);
      const median = samples[4];
      console.log(
        `${edition} ${engine} ${targetCount}x${propertyCount}: ${median.toFixed(3)} ms/${frames} frames, ${(median * 1000 / frames).toFixed(3)} µs/frame`,
      );
    } finally {
      controls.cancel();
    }
  }
}
