import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { DependencyEntry, DependencyManifest } from '../types.js';

const MANIFEST_FILE = 'dependencies.json';

function manifestPath(deviceDir: string): string {
  return path.join(deviceDir, MANIFEST_FILE);
}

export async function readManifest(deviceDir: string): Promise<DependencyManifest> {
  try {
    const raw = await fs.readFile(manifestPath(deviceDir), 'utf8');
    const parsed = JSON.parse(raw) as DependencyManifest;
    if (!parsed.dependencies) parsed.dependencies = {};
    if (!parsed.version) parsed.version = 1;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, dependencies: {} };
    }
    throw err;
  }
}

export async function writeManifest(
  deviceDir: string,
  manifest: DependencyManifest,
): Promise<void> {
  await fs.mkdir(deviceDir, { recursive: true });
  await fs.writeFile(
    manifestPath(deviceDir),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

/**
 * Look up the install command for the current platform. Returns undefined
 * when the entry has no command for `process.platform`.
 */
export function getInstallForPlatform(entry: DependencyEntry): string | undefined {
  const platform = process.platform;
  if (platform === 'darwin') return entry.install.darwin;
  if (platform === 'linux') return entry.install.linux;
  return undefined;
}

/**
 * Check whether a binary is on PATH. Uses the shell builtin `command -v`,
 * which is portable and respects the user's current PATH/aliases.
 */
const VALID_BINARY = /^[a-zA-Z0-9_.+-]+$/;
export async function isInstalled(binary: string): Promise<boolean> {
  if (!VALID_BINARY.test(binary)) return false;
  const { execa } = await import('execa');
  const r = await execa('command', ['-v', binary], { reject: false, shell: true });
  return r.exitCode === 0 && r.stdout.trim().length > 0;
}
