import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import pc from 'picocolors';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest, commitAndPush } from '../core/git.js';
import { listScopedFiles } from '../core/scope.js';
import { buildSubs, tokenize } from '../core/tokenize.js';
import { upsertDevice } from '../core/manifest.js';
import { isBinaryFile, copyFileEnsureDir } from '../core/fs-util.js';
import type { DeviceVersion } from '../types.js';

export interface PushOptions {
  message?: string;
}

export async function pushCommand(opts: PushOptions): Promise<void> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote);
  await pullLatest(paths.hubDir).catch(() => {
    // first push on an empty hub — no upstream to pull yet
  });

  const subs = buildSubs({
    claudeDir: cfg.claudeDir,
    home: os.homedir(),
    extra: cfg.substitutions,
  });

  const files = await listScopedFiles(cfg.claudeDir, cfg.scope);
  console.log(pc.dim(`Scope matched ${files.length} files.`));
  if (files.length === 0) {
    console.log(pc.yellow('Nothing matched the include rules — check your scope config.'));
    return;
  }

  const deviceRoot = path.join(paths.hubDir, 'devices', cfg.device);
  const snapshotRoot = path.join(deviceRoot, 'snapshot');

  // Replace the snapshot wholesale — deletions on this device should propagate.
  await fs.rm(snapshotRoot, { recursive: true, force: true });
  await fs.mkdir(snapshotRoot, { recursive: true });

  let byteCount = 0;
  for (const rel of files) {
    const src = path.join(cfg.claudeDir, rel);
    const dst = path.join(snapshotRoot, rel);
    if (await isBinaryFile(src)) {
      await copyFileEnsureDir(src, dst);
      byteCount += (await fs.stat(src)).size;
    } else {
      const raw = await fs.readFile(src, 'utf8');
      const tokenized = tokenize(raw, subs);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.writeFile(dst, tokenized);
      byteCount += Buffer.byteLength(tokenized);
    }
  }

  const version: DeviceVersion = {
    device: cfg.device,
    pushedAt: new Date().toISOString(),
    host: os.hostname(),
    fileCount: files.length,
    byteCount,
  };
  await fs.writeFile(
    path.join(deviceRoot, 'version.json'),
    JSON.stringify(version, null, 2) + '\n',
  );

  await upsertDevice(paths.hubDir, version);

  const message = opts.message ?? `push: ${cfg.device} — ${files.length} files`;
  const sha = await commitAndPush(paths.hubDir, message);
  if (!sha) {
    console.log(pc.yellow('Already up to date — nothing to push.'));
    return;
  }
  console.log(pc.green(`✓ pushed ${files.length} files as ${cfg.device}@${sha.slice(0, 7)}`));
}
