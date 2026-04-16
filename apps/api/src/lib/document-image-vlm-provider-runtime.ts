import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DocumentImageVlmCapability } from './document-image-vlm-capability.js';

const execFileAsync = promisify(execFile);
let wslHostIpCache: { value: string; expiresAt: number } = {
  value: '',
  expiresAt: 0,
};

export function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function sanitizeText(value: unknown, maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

export function resolveWslReadableImagePath(imagePath: string) {
  const normalized = path.resolve(String(imagePath || '').trim());
  if (process.platform !== 'win32') return normalized;
  const posixLike = normalized.replace(/\\/g, '/');
  const driveMatch = posixLike.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) return normalized;
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

async function resolveWindowsHostIpForWsl() {
  if (process.platform !== 'win32') return '';

  const now = Date.now();
  if (wslHostIpCache.value && wslHostIpCache.expiresAt > now) {
    return wslHostIpCache.value;
  }

  try {
    const result = await execFileAsync(
      'wsl.exe',
      [
        '-d',
        String(process.env.OPENCLAW_WSL_DISTRO || 'Ubuntu-24.04'),
        '--',
        'bash',
        '-lc',
        "ip route | grep '^default' | head -n 1",
      ],
      {
        windowsHide: true,
        timeout: 3000,
      },
    );
    const routeLine = String(result.stdout || '').trim();
    const hostIp = (routeLine.match(/default via\s+([0-9.]+)/) || [])[1] || '';
    if (!hostIp) return '';
    wslHostIpCache = {
      value: hostIp,
      expiresAt: now + 60_000,
    };
    return hostIp;
  } catch {
    return '';
  }
}

function resolveHostedImageContentType(imagePath: string) {
  const extension = String(path.extname(imagePath || '')).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

export async function withHostedDocumentImageUrl<T>(
  imagePath: string,
  run: (imageUrl?: string) => Promise<T>,
) {
  if (process.platform !== 'win32') {
    return run(undefined);
  }

  const hostIp = await resolveWindowsHostIpForWsl();
  if (!hostIp) {
    return run(undefined);
  }

  const bytes = await fs.readFile(imagePath);
  const contentType = resolveHostedImageContentType(imagePath);
  const routePath = `/document-image-vlm/${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(imagePath || '') || '.bin'}`;
  const server = http.createServer((request, response) => {
    if (request.url !== routePath) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const imageUrl = port > 0 ? `http://${hostIp}:${port}${routePath}` : '';

  try {
    return await run(imageUrl || undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function withDocumentImageGatewayEnv<T>(
  capability: DocumentImageVlmCapability,
  run: () => Promise<T>,
) {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const shouldInjectGatewayUrl = !String(process.env.OPENCLAW_GATEWAY_URL || '').trim() && Boolean(capability.gatewayUrl);

  if (shouldInjectGatewayUrl && capability.gatewayUrl) {
    process.env.OPENCLAW_GATEWAY_URL = capability.gatewayUrl;
  }

  try {
    return await run();
  } finally {
    if (shouldInjectGatewayUrl) {
      if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
      else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    }
  }
}
