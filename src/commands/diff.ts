import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest } from '../core/git.js';
import { readManifest } from '../core/manifest.js';
import { buildSubs, resolve as resolveTokens } from '../core/tokenize.js';
import { listScopedFiles } from '../core/scope.js';
import { pathExists } from '../core/fs-util.js';
import { diffTrees } from '../core/diff-engine.js';
import { formatDiffReport } from '../core/diff-format.js';

export interface DiffOptions {
  from?: string;
  patch?: boolean;
  filesOnly?: boolean;
}

export async function diffCommand(opts: DiffOptions): Promise<void> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote);
  await pullLatest(paths.hubDir).catch(() => undefined);

  const source = (opts.from ?? cfg.device).trim();
  const manifest = await readManifest(paths.hubDir);
  if (!manifest.devices[source]) {
    console.error(pc.red(`Unknown device "${source}".`));
    const known = Object.keys(manifest.devices);
    console.error(pc.dim(`Known: ${known.length ? known.join(', ') : '(none — push at least once first)'}`));
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

  const localScoped = (await pathExists(cfg.claudeDir))
    ? await listScopedFiles(cfg.claudeDir, cfg.scope)
    : [];

  const summary = await diffTrees({
    snapshotRoot,
    localRoot: cfg.claudeDir,
    localScoped,
    resolveContent: (text) => resolveTokens(text, subs),
  });

  const header = source === cfg.device
    ? `local vs last push (${cfg.device})`
    : `local (${cfg.device}) ← snapshot (${source})`;
  console.log(pc.bold(`Diff: ${header}`));
  console.log();
  console.log(formatDiffReport(summary, { patch: opts.patch, filesOnly: opts.filesOnly }));
}
