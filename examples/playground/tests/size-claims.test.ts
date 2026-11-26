import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const readme = read('../../../README.md');
const agents = read('../../../AGENTS.md');
const playground = read('../index.html');

it('restates the README morph-stripped size everywhere it is claimed', () => {
  const [, raw, gzip] = readme.match(/`morph-stripped`[^]*?\*\*Size:\*\* `([^`]+) raw` \/ `([^`]+) gzip`/) ?? [];
  expect(gzip).toBeDefined();

  expect(playground).toContain(`<div class="badge">${raw} raw / ${gzip} gzip</div>`);
  expect(readme).toContain(`bundle%20size-${encodeURIComponent(gzip)}%20gzip`);
  expect(agents).toContain(`(${gzip} gzip)`);
  expect(agents).toContain(`(${raw} raw / ${gzip} gzip)`);
});
