/**
 * HTTPS tunnel providers for phone camera testing (secure context required).
 *
 * Default: localtunnel (https://github.com/localtunnel/localtunnel)
 * Override with TUNNEL_PROVIDER=ngrok|pinggy
 * For ngrok, set NGROK_AUTHTOKEN (free at https://dashboard.ngrok.com)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import localtunnel from 'localtunnel';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(repoRoot, '.env');

export function waitForPort(port, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Nothing listening on localhost:${port} after ${timeoutMs / 1000}s`));
          return;
        }
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

export function setPublicBaseUrl(url) {
  const line = `PUBLIC_BASE_URL=${url}`;
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  content = /^PUBLIC_BASE_URL=.*/m.test(content)
    ? content.replace(/^PUBLIC_BASE_URL=.*/m, line)
    : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, content);
}

export function printReady(url, provider) {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Provider:            ${provider}`);
  console.log(`  Open on your phone:  ${url}`);
  console.log(`  Admin:               ${url}/admin`);
  console.log(`  Google OAuth URI:    ${url}/api/auth/google/callback`);
  console.log('══════════════════════════════════════════════════════\n');
}

function pickProvider() {
  const requested = process.env.TUNNEL_PROVIDER?.toLowerCase();
  if (requested) return requested;
  return 'localtunnel';
}

function extractUrl(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** @returns {Promise<{ url: string, provider: string, close: () => void }>} */
async function startLocaltunnel(port) {
  const tunnel = await localtunnel({ port });
  return {
    url: tunnel.url,
    provider: 'localtunnel',
    close: () => tunnel.close(),
  };
}

/** @returns {Promise<{ url: string, provider: string, close: () => void }>} */
function startNgrok(port) {
  if (!process.env.NGROK_AUTHTOKEN) {
    return Promise.reject(
      new Error('NGROK_AUTHTOKEN is required for ngrok. Get one free at https://dashboard.ngrok.com/get-started/your-authtoken'),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['-y', 'ngrok@latest', 'http', String(port), '--log=stdout', '--log-format=json'],
      {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN },
      },
    );

    let settled = false;
    let buffer = '';

    const finish = (url) => {
      settled = true;
      resolve({
        url,
        provider: 'ngrok',
        close: () => child.kill('SIGTERM'),
      });
    };

    const tryParse = () => {
      for (const line of buffer.split('\n')) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const url = event.url ?? event.URL;
          if (typeof url === 'string' && url.startsWith('https://')) {
            finish(url);
            return;
          }
        } catch {
          const url = extractUrl(line, [/https:\/\/[\w.-]+\.ngrok-free\.app/i, /https:\/\/[\w.-]+\.ngrok\.io/i]);
          if (url) finish(url);
        }
      }
    };

    const onData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      if (settled) return;
      buffer += text;
      if (buffer.length > 20_000) buffer = buffer.slice(-10_000);
      tryParse();
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const pollApi = async () => {
      for (let i = 0; i < 30 && !settled; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await fetch('http://127.0.0.1:4040/api/tunnels');
          if (!res.ok) continue;
          const data = await res.json();
          const tunnel = data.tunnels?.find((t) => t.public_url?.startsWith('https://'));
          if (tunnel?.public_url) finish(tunnel.public_url);
        } catch {
          // ngrok API not up yet
        }
      }
    };
    void pollApi();

    child.on('exit', (code) => {
      if (!settled) reject(new Error(`ngrok exited before URL was ready (code ${code})`));
    });
  });
}

/** @returns {Promise<{ url: string, provider: string, close: () => void }>} */
function startPinggy(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-p', '443',
        '-R', `0:127.0.0.1:${port}`,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=30',
        '-t',
        'a.pinggy.io',
        `x:https:localhost:${port}`,
      ],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let settled = false;
    const onData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      if (settled) return;
      const url = extractUrl(text, [/https:\/\/[\w-]+\.(a\.)?pinggy\.(io|link)/i]);
      if (!url) return;
      settled = true;
      resolve({
        url,
        provider: 'pinggy',
        close: () => child.kill('SIGTERM'),
      });
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (!settled) reject(new Error(`pinggy exited before URL was ready (code ${code})`));
    });
  });
}

/** @returns {Promise<{ url: string, provider: string, close: () => void }>} */
export async function startTunnel(port) {
  const provider = pickProvider();
  console.log(`Starting ${provider} tunnel → localhost:${port}...\n`);

  switch (provider) {
    case 'ngrok':
      return startNgrok(port);
    case 'pinggy':
      return startPinggy(port);
    case 'localtunnel':
      return startLocaltunnel(port);
    default:
      throw new Error(`Unknown TUNNEL_PROVIDER "${provider}". Use localtunnel, ngrok, or pinggy.`);
  }
}
