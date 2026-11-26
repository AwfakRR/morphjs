import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('caps the playground grid track minimum at the available width', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const container = css.match(/\.container\s*\{([^}]*)\}/)?.[1];

  expect(container).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*350px\),\s*1fr\)\);/);
});

it('aligns the timeline scrub label and lets the slider fill the available width', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const label = css.match(/\.controls\.scrub label\s*\{([^}]*)\}/)?.[1];
  const input = css.match(/\.controls\.scrub input\s*\{([^}]*)\}/g)?.join('\n');

  expect(label).toMatch(/display:\s*flex;/);
  expect(label).toMatch(/align-items:\s*center;/);
  expect(label).toMatch(/width:\s*100%;/);
  expect(input).toMatch(/flex-grow:\s*1;/);
  expect(input).toMatch(/min-width:\s*0;/);
  expect(input).toMatch(/margin-inline-end:\s*0;/);
});
