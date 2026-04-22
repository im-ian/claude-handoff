import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DeviceVersion, HubManifest } from '../types.js';

const MANIFEST_FILE = 'manifest.json';

export async function readManifest(hubDir: string): Promise<HubManifest> {
  const file = path.join(hubDir, MANIFEST_FILE);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as HubManifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, devices: {}, updatedAt: new Date().toISOString() };
    }
    throw err;
  }
}

export async function writeManifest(hubDir: string, manifest: HubManifest): Promise<void> {
  const file = path.join(hubDir, MANIFEST_FILE);
  const next = { ...manifest, updatedAt: new Date().toISOString() };
  await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n');
}

export async function upsertDevice(hubDir: string, version: DeviceVersion): Promise<HubManifest> {
  const m = await readManifest(hubDir);
  m.devices[version.device] = { latest: version };
  await writeManifest(hubDir, m);
  return m;
}
