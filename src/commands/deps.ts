import path from 'node:path';
import pc from 'picocolors';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest, commitAndPush } from '../core/git.js';
import { readManifest, writeManifest } from '../core/dep-manifest.js';
import type { DependencyManifest } from '../types.js';

export interface DepsAddOptions {
  darwin?: string;
  linux?: string;
  description?: string;
}

async function loadForEdit(): Promise<{
  device: string;
  deviceDir: string;
  manifest: DependencyManifest;
}> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote);
  await pullLatest(paths.hubDir).catch(() => undefined);
  const deviceDir = path.join(paths.hubDir, 'devices', cfg.device);
  const manifest = await readManifest(deviceDir);
  return { device: cfg.device, deviceDir, manifest };
}

export async function depsAddCommand(name: string, opts: DepsAddOptions): Promise<void> {
  if (!name) {
    console.error(pc.red('Dependency name required.'));
    process.exit(1);
  }
  if (!opts.darwin && !opts.linux) {
    console.error(pc.red('At least one of --darwin or --linux must be provided.'));
    process.exit(1);
  }

  const { deviceDir, manifest } = await loadForEdit();
  const existing = manifest.dependencies[name];
  manifest.dependencies[name] = {
    description: opts.description ?? existing?.description,
    install: {
      darwin: opts.darwin ?? existing?.install.darwin,
      linux: opts.linux ?? existing?.install.linux,
    },
  };

  await writeManifest(deviceDir, manifest);
  console.log(
    pc.green(`✓ ${existing ? 'updated' : 'added'} ${pc.cyan(name)} in dependencies.json`),
  );

  const sha = await commitAndPush(
    paths.hubDir,
    `deps: ${existing ? 'update' : 'add'} ${name}`,
  );
  if (sha) console.log(pc.dim(`✓ committed and pushed: ${sha.slice(0, 7)}`));
  else console.log(pc.dim('No git change to commit.'));
}

export async function depsListCommand(): Promise<void> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote).catch(() => undefined);
  await pullLatest(paths.hubDir).catch(() => undefined);
  const deviceDir = path.join(paths.hubDir, 'devices', cfg.device);
  const manifest = await readManifest(deviceDir);

  const entries = Object.entries(manifest.dependencies);
  if (entries.length === 0) {
    console.log(pc.dim('No declared dependencies for this device.'));
    console.log(pc.dim('Add some with `handoff deps add <name> --darwin "..." --linux "..."`.'));
    return;
  }

  console.log(pc.bold(`Dependencies for ${pc.cyan(cfg.device)} (${entries.length}):`));
  console.log();
  for (const [name, entry] of entries) {
    const desc = entry.description ? pc.dim(' — ' + entry.description) : '';
    console.log(pc.cyan(name) + desc);
    if (entry.install.darwin) console.log(`  darwin: ${pc.dim(entry.install.darwin)}`);
    if (entry.install.linux) console.log(`  linux:  ${pc.dim(entry.install.linux)}`);
    if (!entry.install.darwin && !entry.install.linux) {
      console.log(pc.yellow('  (no install commands)'));
    }
  }
}

export async function depsRemoveCommand(name: string): Promise<void> {
  if (!name) {
    console.error(pc.red('Dependency name required.'));
    process.exit(1);
  }
  const { deviceDir, manifest } = await loadForEdit();
  if (!manifest.dependencies[name]) {
    console.log(pc.yellow(`No dependency named "${name}" — nothing to remove.`));
    return;
  }
  delete manifest.dependencies[name];
  await writeManifest(deviceDir, manifest);
  console.log(pc.green(`✓ removed ${pc.cyan(name)} from dependencies.json`));

  const sha = await commitAndPush(paths.hubDir, `deps: remove ${name}`);
  if (sha) console.log(pc.dim(`✓ committed and pushed: ${sha.slice(0, 7)}`));
}
