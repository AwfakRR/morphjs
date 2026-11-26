import { once } from 'node:events';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

// Run pnpm build in each workspace before comparing.
// node packages/core/benchmarks/bezier-sampling.mjs [<baseline-workspace> <head-workspace>]
const seeks = 20_000;
const sampleCount = 21;
const warmups = 8;

async function runWorker() {
  const { root, edition, engine, targetCount, propertyCount } = workerData;
  await Promise.all([import('animejs'), import('gsap')]);
  globalThis.window = {};
  globalThis.document = {};
  globalThis.Element = class {};
  globalThis.NodeList = class {};

  const { animate } = await import(pathToFileURL(resolve(root, 'packages', edition, 'dist/index.js')));
  const properties = Object.fromEntries(
    Array.from({ length: propertyCount }, (_, index) => [`value${index}`, 100]),
  );
  const targets = Array.from({ length: targetCount }, () =>
    Object.fromEntries(Object.keys(properties).map(key => [key, 0])),
  );
  const controls = animate(targets, properties, {
    engine, duration: 1, autoplay: false, ease: [0.2, 0.8, 0.6, 1.4],
  });
  const deadline = performance.now() + 2000;
  while (controls.duration !== 1) {
    if (performance.now() > deadline) throw new Error(`${edition} ${engine} did not initialize`);
    await setImmediate();
  }
  controls.seek(0.5);
  const value = targets.at(-1).value0;
  if (!Number.isFinite(value) || Math.abs(value - 102.49903) > 0.001) {
    throw new Error(`${edition} ${engine} did not render the tuple ease: ${value}`);
  }

  const times = Float64Array.from({ length: seeks }, (_, index) => (index % 239 + 1) / 240);
  const sample = () => {
    const start = performance.now();
    for (let index = 0; index < seeks; index++) controls.seek(times[index]);
    return (performance.now() - start) * 1000 / seeks;
  };
  parentPort.on('message', count => {
    let elapsed;
    for (let i = 0; i < count; i++) elapsed = sample();
    parentPort.postMessage(elapsed);
  });
  parentPort.postMessage('ready');
}

async function measure(roots, workload) {
  // Separate isolates prevent one build from warming the other's engine call sites.
  const workers = roots.map(root => new Worker(new URL(import.meta.url), {
    workerData: { root, ...workload },
  }));
  async function sample(worker, count) {
    const result = once(worker, 'message');
    worker.postMessage(count);
    return (await result)[0];
  }

  try {
    await Promise.all(workers.map(worker => once(worker, 'message')));
    for (const worker of workers) await sample(worker, warmups);
    const durations = workers.map(() => []);
    for (let i = 0; i < sampleCount; i++) {
      const order = workers.length === 1 ? [0] : i % 2 === 0 ? [0, 1] : [1, 0];
      for (const index of order) durations[index].push(await sample(workers[index], 1));
    }
    return durations;
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}

const quartiles = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return [0.25, 0.5, 0.75].map(fraction => sorted[(sorted.length - 1) * fraction]);
};
const format = (values, digits, signed = false) => {
  const [low, median, high] = quartiles(values).map(value =>
    `${signed && value > 0 ? '+' : ''}${value.toFixed(digits)}`,
  );
  return `${median} [${low}, ${high}]`;
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && args.length !== 2) {
    throw new Error('Pass both workspace paths to compare, or no paths to benchmark the current build.');
  }
  const roots = args.length ? args.map(root => resolve(root)) : [fileURLToPath(new URL('../../..', import.meta.url))];
  const paired = roots.length === 2;
  console.log(`${sampleCount} samples × ${seeks} seeks; median [Q1, Q3] µs/seek`);
  for (const edition of ['core', 'morph-stripped']) {
    for (const engine of ['anime', 'gsap']) {
      for (const [targetCount, propertyCount] of [[1, 1], [1, 6], [8, 1], [64, 6]]) {
        const [baseline, head] = await measure(roots, { edition, engine, targetCount, propertyCount });
        const prefix = `${edition} ${engine} ${targetCount}×${propertyCount}:`;
        const first = format(baseline, 4);
        if (!paired) {
          console.log(`${prefix} ${first}`);
        } else {
          const deltas = head.map((value, i) => 100 * (value / baseline[i] - 1));
          console.log(`${prefix} ${first} → ${format(head, 4)}; paired Δ% ${format(deltas, 1, true)}`);
        }
      }
    }
  }
}

await (isMainThread ? main() : runWorker());
