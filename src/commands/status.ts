import pc from 'picocolors';
import { paths, readConfig } from '../core/config.js';
import { readManifest } from '../core/manifest.js';
import { ensureClone, git } from '../core/git.js';

export async function statusCommand(_opts: unknown): Promise<void> {
  const cfg = await readConfig();
  if (!cfg) {
    console.log(pc.yellow('Not initialized.'));
    console.log(pc.dim('Run `handoff init` to get started.'));
    return;
  }

  console.log(pc.bold('Device: ') + pc.cyan(cfg.device));
  console.log(pc.bold('Hub:    ') + cfg.hubRemote);
  console.log(pc.bold('Local:  ') + paths.hubDir);

  try {
    await ensureClone(paths.hubDir, cfg.hubRemote);
    const manifest = await readManifest(paths.hubDir);
    const headResult = await git(paths.hubDir, ['rev-parse', 'HEAD']).catch(() => null);
    const headSha = headResult?.stdout.trim() ?? '(no commits yet)';

    console.log();
    console.log(pc.bold('Hub HEAD: ') + pc.dim(headSha.slice(0, 12)));
    console.log();
    console.log(pc.bold('Known devices:'));

    const entries = Object.entries(manifest.devices).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) {
      console.log(pc.dim('  (none yet — run `handoff push` from this device to register)'));
      return;
    }
    for (const [name, info] of entries) {
      const marker = name === cfg.device ? pc.green('●') : pc.dim('○');
      const time = new Date(info.latest.pushedAt).toLocaleString();
      const label = name.padEnd(20);
      const fileInfo = `${info.latest.fileCount} files`;
      console.log(`  ${marker} ${pc.cyan(label)} ${pc.dim(time)}  ${pc.dim(fileInfo)}`);
    }
  } catch (err) {
    console.log(pc.red('Failed to read hub: ' + (err as Error).message));
  }
}
