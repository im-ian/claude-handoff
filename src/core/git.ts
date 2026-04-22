import { execa } from 'execa';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export async function git(cwd: string, args: string[]) {
  return execa('git', args, { cwd });
}

export async function ensureClone(hubDir: string, remote: string): Promise<void> {
  try {
    await fs.access(path.join(hubDir, '.git'));
    await git(hubDir, ['remote', 'set-url', 'origin', remote]);
    await git(hubDir, ['fetch', 'origin']);
  } catch {
    await fs.mkdir(path.dirname(hubDir), { recursive: true });
    await execa('git', ['clone', remote, hubDir], { stdio: 'inherit' });
  }
}

export async function commitAndPush(cwd: string, message: string): Promise<string | null> {
  await git(cwd, ['add', '-A']);
  const status = await git(cwd, ['status', '--porcelain']);
  if (!status.stdout.trim()) return null;
  await git(cwd, ['commit', '-m', message]);
  const sha = (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim();
  await git(cwd, ['push', 'origin', 'HEAD']);
  return sha;
}

export async function pullLatest(cwd: string): Promise<void> {
  await git(cwd, ['fetch', 'origin']);
  const branchResult = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.stdout.trim();
  // Allow "HEAD" (detached) — skip pull
  if (branch === 'HEAD') return;
  await git(cwd, ['pull', '--ff-only', 'origin', branch]);
}
