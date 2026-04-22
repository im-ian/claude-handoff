import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest } from '../core/git.js';
import { readManifest } from '../core/manifest.js';
import { buildSubs, resolve as resolveTokens } from '../core/tokenize.js';
import { listScopedFiles } from '../core/scope.js';
import { pathExists } from '../core/fs-util.js';
import { diffTrees, type DiffCounts, type FileChange } from '../core/diff-engine.js';

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

  const relevant = summary.changes.filter((c) => c.status !== 'unchanged');
  if (relevant.length === 0) {
    console.log(pc.green('✓ No differences within scope.'));
    return;
  }

  for (const change of relevant) {
    const marker = markerFor(change.status);
    const metric = metricFor(change);
    console.log(`  ${marker} ${pc.cyan(change.path)} ${metric}`);
    if (opts.patch && change.patch) {
      console.log();
      console.log(colorizePatch(change.patch));
    }
  }

  if (opts.filesOnly) return;

  console.log();
  console.log(pc.dim(summaryLine(summary.counts, relevant.length)));
  if (summary.counts.deleted > 0) {
    console.log(pc.dim('(L = local-only; `pull` will not remove these.)'));
  }
}

function markerFor(status: FileChange['status']): string {
  switch (status) {
    case 'added':
      return pc.green('+');
    case 'modified':
      return pc.yellow('M');
    case 'binary-modified':
      return pc.yellow('B');
    case 'deleted':
      return pc.dim('L');
    default:
      return ' ';
  }
}

function metricFor(change: FileChange): string {
  switch (change.status) {
    case 'added':
      return pc.dim(`(new, +${change.additions} lines)`);
    case 'modified':
      return pc.dim(`(+${change.additions} -${change.deletions})`);
    case 'binary-modified':
      return pc.dim('(binary changed)');
    case 'deleted':
      return pc.dim('(only in local)');
    default:
      return '';
  }
}

function summaryLine(counts: DiffCounts, total: number): string {
  const parts: string[] = [];
  if (counts.added) parts.push(`${counts.added} added`);
  const modified = counts.modified + counts['binary-modified'];
  if (modified) parts.push(`${modified} modified`);
  if (counts.deleted) parts.push(`${counts.deleted} local-only`);
  return `${total} files differ (${parts.join(', ')}).`;
}

function colorizePatch(patch: string): string {
  return patch
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return pc.bold(line);
      if (line.startsWith('@@')) return pc.cyan(line);
      if (line.startsWith('+')) return pc.green(line);
      if (line.startsWith('-')) return pc.red(line);
      return line;
    })
    .join('\n');
}
