import path from 'node:path';
import pc from 'picocolors';
import prompts from 'prompts';
import { execa } from 'execa';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest } from '../core/git.js';
import { readManifest, getInstallForPlatform, isInstalled } from '../core/dep-manifest.js';

export interface BootstrapOptions {
  yes?: boolean;
  dryRun?: boolean;
}

interface PlanItem {
  binary: string;
  cmd: string;
}

export async function bootstrapCommand(opts: BootstrapOptions): Promise<void> {
  const cfg = await requireConfig();

  await ensureClone(paths.hubDir, cfg.hubRemote).catch(() => undefined);
  await pullLatest(paths.hubDir).catch(() => undefined);

  const deviceDir = path.join(paths.hubDir, 'devices', cfg.device);
  const manifest = await readManifest(deviceDir);

  if (Object.keys(manifest.dependencies).length === 0) {
    console.log(pc.dim("No declared dependencies in this device's manifest."));
    console.log(
      pc.dim('Add some with `handoff deps add <name> --darwin "..." --linux "..."`.'),
    );
    return;
  }

  const plan: PlanItem[] = [];
  for (const [binary, entry] of Object.entries(manifest.dependencies)) {
    const cmd = getInstallForPlatform(entry);
    if (!cmd) continue;
    if (await isInstalled(binary)) continue;
    plan.push({ binary, cmd });
  }

  if (plan.length === 0) {
    console.log(pc.green('All declared dependencies are already installed.'));
    return;
  }

  console.log(pc.bold(`Install plan (${plan.length} missing):`));
  for (const p of plan) {
    console.log(`  ${pc.cyan(p.binary.padEnd(20))} ${pc.dim(p.cmd)}`);
  }
  console.log();

  if (opts.dryRun) {
    console.log(pc.yellow('(--dry-run — nothing executed)'));
    return;
  }

  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        pc.red('stdin is not a TTY. Re-run with --yes, or run interactively.'),
      );
      process.exit(1);
    }
    const { proceed } = await prompts(
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Run all install commands above?',
        initial: false,
      },
      { onCancel: () => ({ proceed: false }) },
    );
    if (!proceed) {
      console.log(pc.yellow('Bootstrap aborted.'));
      return;
    }
  }

  let okCount = 0;
  let failCount = 0;
  for (const p of plan) {
    process.stdout.write(pc.dim(`Installing ${p.binary}... `));
    try {
      await execa(p.cmd, { shell: true, stdio: 'inherit' });
      const ok = await isInstalled(p.binary);
      if (ok) {
        okCount++;
        console.log(pc.green('✓'));
      } else {
        failCount++;
        console.log(pc.red('✗ (command not found after install)'));
      }
    } catch (err) {
      failCount++;
      console.log(pc.red(`✗ (${(err as Error).message})`));
    }
  }

  console.log();
  console.log(pc.bold(`${okCount} succeeded, ${failCount} failed.`));
  if (failCount > 0) process.exit(1);
}
