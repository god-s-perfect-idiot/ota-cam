import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Full production build for Vercel/Netlify.
 * Always builds web + server, then copies the SPA to `public/` (and
 * `server/public/`) so Vercel succeeds whether Root Directory is `.` or `server`
 * and whether Output Directory is `public` or `web/dist`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const webDist = path.join(root, 'web', 'dist');

execSync('npm run build --workspace web', { cwd: root, stdio: 'inherit' });
execSync('npx tsc -p tsconfig.json', { cwd: serverDir, stdio: 'inherit' });

if (!fs.existsSync(path.join(webDist, 'index.html'))) {
  console.error('web/dist/index.html missing after web build');
  process.exit(1);
}

for (const dest of [path.join(root, 'public'), path.join(serverDir, 'public')]) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(webDist, dest, { recursive: true });
  console.log(`synced web/dist → ${path.relative(root, dest)}`);
}
