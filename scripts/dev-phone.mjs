#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printReady, setPublicBaseUrl, startTunnel, waitForPort } from './lib/tunnel.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitePort = 5173;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** @type {Array<{ close?: () => void, kill?: (signal: NodeJS.Signals) => void }>} */
const children = [];

function run(command, args, opts = {}) {
  const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit', ...opts });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    child.close?.();
    if (child.kill && !child.killed) child.kill('SIGTERM');
  }
}

async function main() {
  console.log('Starting Vite...\n');
  run(npmCmd, ['run', 'dev:web']);

  await waitForPort(vitePort);

  const tunnel = await startTunnel(vitePort);
  children.push(tunnel);
  setPublicBaseUrl(tunnel.url);
  printReady(tunnel.url, tunnel.provider);

  console.log('Starting API server with tunnel URL...\n');
  run(npmCmd, ['run', 'dev:server']);

  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown();
  process.exit(1);
});
