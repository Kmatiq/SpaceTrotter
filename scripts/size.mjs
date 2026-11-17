// Reports the deliverable's size: source, esbuild-minified (React external), and gzip/brotli.
// WGSL inside the /*wgsl*/ template literal is minified too (comments + redundant whitespace).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { transformSync } from 'esbuild';

const src = readFileSync(new URL('../src/SpaceTrotter.jsx', import.meta.url), 'utf8');
const minWgsl = (w) => w.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()[\];,:=<>+\-*/&|!?@.^%]) ?/g, '$1').trim();
const pre = src.replace(/\/\*wgsl\*\/`([\s\S]*?)`/, (_, w) => '`' + minWgsl(w) + '`');
const { code } = transformSync(pre, { loader: 'jsx', jsx: 'automatic', minify: true, format: 'esm', target: 'es2022' });
mkdirSync(new URL('../dist', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/SpaceTrotter.min.js', import.meta.url), code);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const wg = (src.match(/\/\*wgsl\*\/`([\s\S]*?)`/) || [, ''])[1];
console.table({
  'source (SpaceTrotter.jsx)': kb(Buffer.byteLength(src)),
  'minified': kb(Buffer.byteLength(code)),
  'minified + gzip': kb(gzipSync(code, { level: 9 }).length),
  'minified + brotli': kb(brotliCompressSync(code).length),
  'of which WGSL (minified)': kb(Buffer.byteLength(minWgsl(wg))),
});
