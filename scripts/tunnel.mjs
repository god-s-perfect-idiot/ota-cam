#!/usr/bin/env node
import { printReady, setPublicBaseUrl, startTunnel, waitForPort } from './lib/tunnel.mjs';

const port = Number(process.env.TUNNEL_PORT ?? '5173');

async function main() {
  if (process.env.TUNNEL_SKIP_WAIT !== '1') {
    console.log(`Waiting for localhost:${port} (start Vite if you have not already)...`);
    await waitForPort(port);
  }

  const tunnel = await startTunnel(port);
  setPublicBaseUrl(tunnel.url);
  printReady(tunnel.url, tunnel.provider);
  console.log('Updated PUBLIC_BASE_URL in .env — restart the server if it was already running.\n');

  process.on('SIGINT', () => { tunnel.close(); process.exit(0); });
  process.on('SIGTERM', () => { tunnel.close(); process.exit(0); });

  await new Promise(() => {
    // Keep alive until interrupted; localtunnel stays open via its client connection.
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
