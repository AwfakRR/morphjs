import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { afterAll, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const packageRoot = fileURLToPath(new URL('../../../packages/morph-stripped/', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'morph-stripped-'));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it('shows the gzip size of the morph-stripped ESM bundle in the header badge', async () => {
  await build({
    root: packageRoot,
    configFile: join(packageRoot, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
  const gzipKb = gzipSync(readFileSync(join(outDir, 'index.js'))).length / 1000;

  const badge = html.match(/<div class="badge">([^<]*)<\/div>/)?.[1];
  expect(badge).toBe(`${gzipKb.toFixed(1)} KB gzip`);
}, 30_000);
