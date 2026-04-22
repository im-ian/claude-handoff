import pc from 'picocolors';
import type { DiffCounts, DiffSummary, FileChange } from './diff-engine.js';

export interface FormatOptions {
  patch?: boolean;
  filesOnly?: boolean;
}

export function formatDiffReport(summary: DiffSummary, opts: FormatOptions = {}): string {
  const lines: string[] = [];
  const relevant = summary.changes.filter((c) => c.status !== 'unchanged');
  if (relevant.length === 0) {
    lines.push(pc.green('✓ No differences within scope.'));
    return lines.join('\n');
  }

  for (const change of relevant) {
    const marker = markerFor(change.status);
    const metric = metricFor(change);
    lines.push(`  ${marker} ${pc.cyan(change.path)} ${metric}`);
    if (opts.patch && change.patch) {
      lines.push('');
      lines.push(colorizePatch(change.patch));
    }
  }

  if (opts.filesOnly) return lines.join('\n');

  lines.push('');
  lines.push(pc.dim(summaryLine(summary.counts, relevant.length)));
  if (summary.counts.deleted > 0) {
    lines.push(pc.dim('(L = local-only; `pull` will not remove these.)'));
  }
  return lines.join('\n');
}

export function hasRelevantChanges(summary: DiffSummary): boolean {
  return summary.changes.some((c) => c.status !== 'unchanged');
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
