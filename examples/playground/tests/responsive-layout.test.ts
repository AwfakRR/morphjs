import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('caps the playground grid track minimum at the available width', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const container = css.match(/\.container\s*\{([^}]*)\}/)?.[1];

  expect(container).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*350px\),\s*1fr\)\);/);
});
