// Builds ONE self-contained, double-clickable HTML file (React + engine inlined): dist/spacetrotter.html (+ spaceroam.html copy for old links)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const { outputFiles } = await build({
  entryPoints: [new URL('src/main.jsx', root).pathname], bundle: true, minify: true, write: false,
  format: 'iife', target: 'es2022', jsx: 'automatic', loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"', __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
});
const js = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(new URL('index.html', root), 'utf8')
  .replace(/<script type="module" src="\/src\/main.jsx"><\/script>/, () => `<script>${js}</script>`);
mkdirSync(new URL('dist', root), { recursive: true });
writeFileSync(new URL('dist/spacetrotter.html', root), html); writeFileSync(new URL('dist/spaceroam.html', root), html); // old link keeps working
console.log(`dist/spacetrotter.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
