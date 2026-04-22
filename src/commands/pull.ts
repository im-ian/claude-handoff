import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import pc from 'picocolors';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest } from '../core/git.js';
import { buildSubs, resolve } from '../core/tokenize.js';
import { readManifest } from '../core/manifest.js';
import { copyFileEnsureDir, isBinaryFile, walkFiles, pathExists } from '../core/fs-util.js';

export interface PullOptions {
  from?: string;
  dryRun?: boolean;
}

export async function pullCommand(opts: PullOptions): Promise<void> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote);
  await pullLatest(paths.hubDir);

  const source = (opts.from ?? cfg.device).trim();
  const manifest = await readManifest(paths.hubDir);

  if (!manifest.devices[source]) {
    console.error(pc.red(`Unknown device "${source}".`));
    const known = Object.keys(manifest.devices);
    console.error(pc.dim(`Known devices: ${known.length ? known.join(', ') : '(none — push from at least one device first)'}`));
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

  const files = await walkFiles(snapshotRoot);
  console.log(pc.dim(`Applying ${files.length} files from "${source}" → ${cfg.claudeDir}`));

  if (opts.dryRun) {
    for (const rel of files) console.log(`  ${pc.cyan('[dry]')} ${rel}`);
    console.log(pc.yellow(`(dry-run — no files written)`));
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
    console.log(pc.dim(`Pulled files within scope were overwritten; files outside scope are untouched.`));
  }
}
