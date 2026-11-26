import { afterEach, expect, it, vi } from 'vitest';

class MockSvgPath {
  readonly nodeType = 1;
  readonly tagName = 'path';
  readonly style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getTotalLength() {
    return 500;
  }
}

class MockButton {
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, fn: () => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  click() {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }
}

const flushAsync = async () => {
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

const readOffset = (path: MockSvgPath) =>
  parseFloat(
    String(
      path.style['stroke-dashoffset'] ??
        path.style.strokeDashoffset ??
        path.attributes['stroke-dashoffset'] ??
        'NaN',
    ),
  );

let rafCallbacks = new Map<number, FrameRequestCallback>();

afterEach(() => {
  rafCallbacks.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('toggles Draw Stroke smoothly from its current offset on mid-draw and mid-erase clicks', async () => {
  let now = 1000;
  let nextRafId = 1;
  rafCallbacks = new Map();

  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Date, 'now').mockImplementation(() => now);

  const raf = (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  };
  const caf = (id: number) => {
    rafCallbacks.delete(id);
  };

  const step = async (ms: number, frameMs = 16) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(now + frameMs, end);
      const pending = [...rafCallbacks.entries()];
      rafCallbacks.clear();
      for (const [, cb] of pending) cb(now);
      await Promise.resolve();
    }
  };

  const button = new MockButton();
  const path = new MockSvgPath();
  const getComputedStyle = (el: MockSvgPath) => ({
    getPropertyValue: (prop: string) => {
      const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      return el.style[camel] ?? el.style[prop] ?? '';
    },
  });

  class MockNodeList extends Array {}

  vi.stubGlobal('window', {
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    getComputedStyle,
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  vi.stubGlobal('getComputedStyle', getComputedStyle);
  vi.stubGlobal('NodeList', MockNodeList);
  vi.stubGlobal('HTMLCollection', class {});
  vi.stubGlobal('SVGElement', MockSvgPath);
  vi.stubGlobal('document', {
    addEventListener() {},
    getElementById(id: string) {
      if (id === 'btn-svg-draw') return button;
      if (id === 'svg-stroke') return path;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === '#svg-stroke') return new MockNodeList(path);
      if (selector.startsWith('#tl-box-')) return new MockNodeList({ nodeType: 1, tagName: 'div', style: {} });
      return new MockNodeList();
    },
  });

  await import('animejs');
  await import('motion');
  await import('../src/main');
  await flushAsync();
  expect(readOffset(path)).toBe(500);

  // 1. Start drawing, then click again mid-draw
  button.click();
  await flushAsync();
  await step(250);
  const midDrawOffset = readOffset(path);
  expect(midDrawOffset).toBeGreaterThan(300);
  expect(midDrawOffset).toBeLessThan(480);

  button.click();
  await flushAsync();
  await step(48);
  const afterMidDrawReverse = readOffset(path);
  // Must continue erasing back toward 500 rather than flashing near 0
  expect(afterMidDrawReverse).toBeGreaterThanOrEqual(midDrawOffset);
  expect(afterMidDrawReverse).toBeLessThanOrEqual(500);

  // Settles back to hidden (500)
  await step(1600);
  expect(readOffset(path)).toBeCloseTo(500, 1);

  // 2. Full draw settles at fully visible (0)
  button.click();
  await flushAsync();
  await step(1600);
  expect(readOffset(path)).toBeCloseTo(0, 1);

  // 3. Start erasing, then click again mid-erase
  button.click();
  await flushAsync();
  await step(250);
  const midEraseOffset = readOffset(path);
  expect(midEraseOffset).toBeGreaterThan(20);
  expect(midEraseOffset).toBeLessThan(200);

  button.click();
  await flushAsync();
  await step(48);
  const afterMidErasePlay = readOffset(path);
  // Must continue drawing back toward 0 rather than flashing near 500
  expect(afterMidErasePlay).toBeLessThanOrEqual(midEraseOffset);
  expect(afterMidErasePlay).toBeGreaterThanOrEqual(0);

  // Settles back to fully drawn (0)
  await step(1600);
  expect(readOffset(path)).toBeCloseTo(0, 1);
});
