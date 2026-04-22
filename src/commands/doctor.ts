import path from 'node:path';
import pc from 'picocolors';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest } from '../core/git.js';
import { detectDeps, groupByBinary, type DepRef } from '../core/dep-detect.js';
import { readManifest, getInstallForPlatform, isInstalled } from '../core/dep-manifest.js';

export interface DoctorOptions {
  verbose?: boolean;
  fix?: boolean;
}

interface MissingDep {
  binary: string;
  refs: DepRef[];
  declared: boolean;
  installCmd?: string;
}

export async function doctorCommand(opts: DoctorOptions): Promise<void> {
  const cfg = await requireConfig();

  // Best-effort hub refresh so we use the latest manifest.
  await ensureClone(paths.hubDir, cfg.hubRemote).catch(() => undefined);
  await pullLatest(paths.hubDir).catch(() => undefined);

  const refs = await detectDeps(cfg.claudeDir);
  const grouped = groupByBinary(refs);

  if (grouped.size === 0) {
    console.log(pc.dim('No external dependencies referenced by hooks.'));
    return;
  }

  const deviceDir = path.join(paths.hubDir, 'devices', cfg.device);
  const manifest = await readManifest(deviceDir);

  const present: string[] = [];
  const missing: MissingDep[] = [];

  for (const [binary, refList] of grouped) {
    if (await isInstalled(binary)) {
      present.push(binary);
    } else {
      const decl = manifest.dependencies[binary];
      missing.push({
        binary,
        refs: refList,
        declared: Boolean(decl),
        installCmd: decl ? getInstallForPlatform(decl) : undefined,
      });
    }
  }

  console.log(pc.dim(`Checking ${grouped.size} binaries referenced by hooks...`));
  console.log();

  if (present.length > 0) {
    if (opts.verbose) {
      for (const b of present) console.log(pc.green(`  ✓ ${b}`));
    } else {
      console.log(
        pc.green(`  ✓ ${present.length} present: `) + pc.dim(present.join(', ')),
      );
    }
  }

  if (missing.length === 0) {
    console.log();
    console.log(pc.green('All dependencies satisfied.'));
    return;
  }

  console.log();
  console.log(pc.red(`⚠  ${missing.length} missing — these will fail at runtime:`));
  console.log();

  for (const m of missing) {
    console.log(pc.bold(pc.red(`  ${m.binary}`)));
    const shown = m.refs.slice(0, 3);
    for (const ref of shown) {
      const loc = ref.line ? `${ref.file}:${ref.line}` : ref.file;
      console.log(pc.dim(`    Used in: ${loc}`));
      console.log(pc.dim(`      "${ref.context}"`));
    }
    if (m.refs.length > shown.length) {
      console.log(pc.dim(`    +${m.refs.length - shown.length} more occurrence(s)`));
    }

    if (m.declared && m.installCmd) {
      console.log(`    ${pc.cyan('Fix:')} ${m.installCmd}`);
      console.log(pc.dim(`    Or: handoff bootstrap`));
    } else if (m.declared) {
      console.log(
        `    ${pc.yellow(`Declared, but no install command for ${process.platform}.`)}`,
      );
      console.log(
        pc.dim(
          `    Add: handoff deps add ${m.binary} --${process.platform} "<install cmd>"`,
        ),
      );
    } else {
      console.log(`    ${pc.yellow('⚠ Not declared in dependencies.json')}`);
      const flag = process.platform === 'linux' ? '--linux' : '--darwin';
      console.log(
        pc.dim(`    Suggest: handoff deps add ${m.binary} ${flag} "<install cmd>"`),
      );
    }
    console.log();
  }

  if (opts.fix) {
    console.log(pc.dim('--fix: running bootstrap...'));
    const { bootstrapCommand } = await import('./bootstrap.js');
    await bootstrapCommand({});
    return;
  }

  process.exit(1);
}
