import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import type { DeviceConfig } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.claude-handoff');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HUB_DIR = path.join(CONFIG_DIR, 'hub');

const configSchema = z.object({
  device: z.string().min(1),
  hubRemote: z.string().min(1),
  claudeDir: z.string(),
  substitutions: z.array(z.object({ from: z.string(), to: z.string() })),
  scope: z.object({
    include: z.array(z.string()),
    optIn: z.array(z.string()),
    excludeExtra: z.array(z.string()),
  }),
});

export const paths = {
  configDir: CONFIG_DIR,
  configFile: CONFIG_FILE,
  hubDir: HUB_DIR,
};

export async function readConfig(): Promise<DeviceConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    return configSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeConfig(cfg: DeviceConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

export async function requireConfig(): Promise<DeviceConfig> {
  const cfg = await readConfig();
  if (!cfg) throw new Error('Not initialized. Run `handoff init` first.');
  return cfg;
}
