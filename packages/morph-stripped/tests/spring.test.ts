import { afterEach, expect, it, vi } from 'vitest';
import { spring } from '../src/index';
import { loadMotion } from '../src/engine';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('starts a staged spring at its first keyframe rather than the current value', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('SVGElement', class {});
  vi.stubGlobal('NodeList', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  await loadMotion();

  let val = 0;
  const values: number[] = [];
  const target = {
    get val() { return val; },
    set val(value: number) { val = value; values.push(value); },
  };
  const controls = spring(target as any, { val: [-100, 30, 0] });

  await vi.advanceTimersByTimeAsync(4000);
  await controls.finished;

  expect(values[0]).toBeGreaterThan(-105);
  expect(values[0]).toBeLessThan(-95);
  expect(values).toContain(30);
  expect(val).toBe(0);
});
