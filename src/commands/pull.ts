import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import pc from 'picocolors';
import prompts from 'prompts';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest } from '../core/git.js';
import { buildSubs, resolve } from '../core/tokenize.js';
import { readManifest } from '../core/manifest.js';
import { listScopedFiles } from '../core/scope.js';
import {
  copyFileEnsureDir,
  isBinaryFile,
  walkFiles,
  pathExists,
} from '../core/fs-util.js';
import { diffTrees } from '../core/diff-engine.js';
import { formatDiffReport, hasRelevantChanges } from '../core/diff-format.js';
import type { DeviceConfig, HubManifest } from '../types.js';

export interface PullOptions {
  from?: string;
  dryRun?: boolean;
  confirm?: boolean;
}

export async function pullCommand(opts: PullOptions): Promise<void> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote);
  await pullLatest(paths.hubDir);

  const manifest = await readManifest(paths.hubDir);
  const source = await resolveSource(opts, cfg, manifest);
  if (source === null) return;

  if (!manifest.devices[source]) {
    console.error(pc.red(`Unknown device "${source}".`));
    const known = Object.keys(manifest.devices);
    console.error(
      pc.dim(`Known devices: ${known.length ? known.join(', ') : '(none — push from at least one device first)'}`),
    );
    process.exit(1);
  }

  const snapshotRoot = path.join(paths.hubDir, 'devices', source, 'snapshot');
  if (!(await pathExists(snapshotRoot))) {
    console.error(pc.red(`No snapshot directory at ${snapshotRoot}`));
    process.exit(1);
  }

  const subs = buildSubs({
    claudeDir: cfg.claudeDir,
    home: os.homedir(),
    extra: cfg.substitutions,
  });

  if (opts.confirm && !opts.dryRun) {
    const localScoped = (await pathExists(cfg.claudeDir))
      ? await listScopedFiles(cfg.claudeDir, cfg.scope)
      : [];
    const summary = await diffTrees({
      snapshotRoot,
      localRoot: cfg.claudeDir,
      localScoped,
      resolveContent: (text) => resolve(text, subs),
    });

    const header = source === cfg.device
      ? `local vs last push (${cfg.device})`
      : `local (${cfg.device}) ← snapshot (${source})`;
    console.log(pc.bold(`Diff: ${header}`));
    console.log();
    console.log(formatDiffReport(summary));
    console.log();

    if (!hasRelevantChanges(summary)) {
      console.log(pc.green('✓ Already up to date — nothing to pull.'));
      return;
    }

    if (!process.stdin.isTTY) {
      console.error(pc.red('--confirm was requested but stdin is not a TTY.'));
      process.exit(1);
    }

    const { proceed } = await prompts(
      {
        type: 'confirm',
        name: 'proceed',
        message: `Apply these changes to ${cfg.claudeDir}?`,
        initial: false,
      },
      { onCancel: () => ({ proceed: false }) },
    );

    if (!proceed) {
      console.log(pc.yellow('Pull aborted.'));
      return;
    }
  }

  const files = await walkFiles(snapshotRoot);
  console.log(pc.dim(`Applying ${files.length} files from "${source}" → ${cfg.claudeDir}`));

  if (opts.dryRun) {
    for (const rel of files) console.log(`  ${pc.cyan('[dry]')} ${rel}`);
    console.log(pc.yellow('(dry-run — no files written)'));
    return;
  }

  await fs.mkdir(cfg.claudeDir, { recursive: true });

  for (const rel of files) {
    const src = path.join(snapshotRoot, rel);
    const dst = path.join(cfg.claudeDir, rel);
    if (await isBinaryFile(src)) {
      await copyFileEnsureDir(src, dst);
    } else {
      const raw = await fs.readFile(src, 'utf8');
      const resolved = resolve(raw, subs);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.writeFile(dst, resolved);
    }
  }

  console.log(pc.green(`✓ pulled "${source}" into ${cfg.claudeDir}`));
  if (source !== cfg.device) {
    console.log(pc.dim('Pulled files within scope were overwritten; files outside scope are untouched.'));
  }
}

/**
 * Resolve which device to pull from.
 * - If opts.from is provided, use it verbatim.
 * - Else if the hub has exactly 0 devices: abort with guidance.
 * - Else if the hub has exactly 1 device: auto-select it.
 * - Else in a TTY: interactive picker sorted by most recent push, current device pre-selected.
 * - Else (non-TTY, N>1): abort with a list of options so the caller can pass --from next time.
 * Returns the chosen device name, or null if the user aborted / no selection is possible.
 */
async function resolveSource(
  opts: PullOptions,
  cfg: DeviceConfig,
  manifest: HubManifest,
): Promise<string | null> {
  if (opts.from && opts.from.trim().length > 0) return opts.from.trim();

  const entries = Object.entries(manifest.devices);

  if (entries.length === 0) {
    console.error(pc.red('No devices registered in the hub yet.'));
    console.error(pc.dim('Run `handoff push` from at least one device first.'));
    return null;
  }

  if (entries.length === 1) {
    const only = entries[0]![0];
    console.log(pc.dim(`Only one device in the hub — selecting ${pc.cyan(only)}.`));
    return only;
  }

  if (!process.stdin.isTTY) {
    console.error(pc.red('Multiple devices in hub and stdin is not a TTY.'));
    console.error(pc.dim(`Re-run with --from <device>. Known: ${entries.map(([n]) => n).join(', ')}`));
    return null;
  }

  const sortedEntries = entries.sort((a, b) =>
    b[1].latest.pushedAt.localeCompare(a[1].latest.pushedAt),
  );
  const choices = sortedEntries.map(([name, info]) => {
    const suffix = name === cfg.device ? pc.dim(' (this device)') : '';
    const when = new Date(info.latest.pushedAt).toLocaleString();
    const meta = pc.dim(`— ${info.latest.fileCount} files, ${when}`);
    return { title: `${name}${suffix}  ${meta}`, value: name };
  });
  const currentIdx = choices.findIndex((c) => c.value === cfg.device);

  const response = await prompts(
    {
      type: 'select',
      name: 'selected',
      message: 'Pull from which device?',
      choices,
      initial: currentIdx >= 0 ? currentIdx : 0,
    },
    { onCancel: () => ({ selected: null }) },
  );

  const selected = response.selected as string | null | undefined;
  if (!selected) {
    console.log(pc.yellow('Pull aborted (no device selected).'));
    return null;
  }
  return selected;
}
