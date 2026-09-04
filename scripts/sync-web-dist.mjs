import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Copy Vite output to repo-root `dist/` so Vercel’s default Output Directory works. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'web', 'dist');
const dest = path.join(root, 'dist');

if (!fs.existsSync(src)) {
  console.error('web/dist missing — run the web build first');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('synced web/dist → dist');
