import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

const rule = (selector: string) => {
  const declarations: Record<string, string> = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!selectors.split(',').some(item => item.trim() === selector)) continue;
    for (const [, property, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
      declarations[property] = value.trim();
    }
  }
  return declarations;
};

const px = (value: string) => parseFloat(value) * (value.endsWith('rem') ? 16 : 1);

it('keeps the parallax box inside the scroll viewport at every scroll position', () => {
  const box = rule('.parallax-box');
  const viewport = px(rule('.scroll-container').height);
  const maxShift = Number(main.match(/translateY\(\$\{progress \* (\d+)\}px\)/)?.[1]);

  expect(box.position).toBe('sticky');
  expect(box['margin-top']).toBeUndefined();
  expect(px(box.top) + px(box.height) + maxShift).toBeLessThanOrEqual(viewport);
});
