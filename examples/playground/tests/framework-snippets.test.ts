import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const frameworks = ['react', 'vue', 'svelte', 'tanstack'];
const packages = frameworks.map(framework => new URL(`../../../packages/${framework}/`, import.meta.url));
const entries = packages.map(pkg => fileURLToPath(new URL('src/index.ts', pkg)));
const program = ts.createProgram(entries, {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: [],
});
const checker = program.getTypeChecker();

it.each(frameworks)('shows public package imports in the %s snippet', framework => {
  const index = frameworks.indexOf(framework);
  const { name } = JSON.parse(readFileSync(new URL('package.json', packages[index]), 'utf8'));
  const pane = html.match(new RegExp(`<pre id="tab-${framework}"[^>]*><code>([\\s\\S]*?)</code></pre>`))?.[1] ?? '';
  const imports = [...pane.matchAll(/import\s*\{([^}]+)\}\s*from '([^']+)'/g)];
  const morphImports = imports.filter(([, , from]) => /^@?morphjs\//.test(from));
  expect(morphImports.length).toBeGreaterThan(0);

  const entry = program.getSourceFile(entries[index])!;
  const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(entry)!).map(item => item.name);
  for (const [, names, from] of morphImports) {
    expect(from).toBe(name);
    for (const imported of names.split(',')) {
      const symbol = imported.trim().split(/\s+as\s+/)[0];
      expect(exports).toContain(symbol);
    }
  }
});
