import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import pc from 'picocolors';
import prompts from 'prompts';
import { paths, requireConfig } from '../core/config.js';
import { ensureClone, pullLatest, commitAndPush } from '../core/git.js';
import { listScopedFiles } from '../core/scope.js';
import { buildSubs, tokenize } from '../core/tokenize.js';
import { upsertDevice } from '../core/manifest.js';
import { isBinaryFile, copyFileEnsureDir } from '../core/fs-util.js';
import { groupByFile, scanFiles, type SecretFinding } from '../core/secret-scanner.js';
import { detectHubVisibility, type HubVisibility } from '../core/hub-privacy.js';
import type { DeviceVersion } from '../types.js';

export interface PushOptions {
  message?: string;
  allowSecrets?: boolean;
  skipOnSecrets?: boolean;
}

export async function pushCommand(opts: PushOptions): Promise<void> {
  const cfg = await requireConfig();
  await ensureClone(paths.hubDir, cfg.hubRemote);
  await pullLatest(paths.hubDir).catch(() => undefined);

  const files = await listScopedFiles(cfg.claudeDir, cfg.scope);
  console.log(pc.dim(`Scope matched ${files.length} files.`));
  if (files.length === 0) {
    console.log(pc.yellow('Nothing matched the include rules — check your scope config.'));
    return;
  }

  const skippedBySecretReview = new Set<string>();
  if (opts.allowSecrets) {
    console.log(pc.dim('Secret scan bypassed (--allow-secrets).'));
  } else {
    const filesToScan = files.filter((f) => !cfg.secretPolicy.allow.includes(f));
    const findings = await scanFiles(cfg.claudeDir, filesToScan);
    if (findings.length > 0) {
      const visibility = await detectHubVisibility(cfg.hubRemote);
      printScanReport(findings, visibility, cfg.hubRemote);
      const decision = await reviewSecrets(findings, visibility, opts);
      if (decision.abort) {
        console.log(pc.yellow('Push aborted.'));
        return;
      }
      for (const f of decision.skipFiles) skippedBySecretReview.add(f);
    } else {
      console.log(pc.dim('No secrets detected.'));
    }
  }

  const allowedFiles = files.filter((f) => !skippedBySecretReview.has(f));
  if (skippedBySecretReview.size > 0) {
    console.log(pc.dim(`Skipping ${skippedBySecretReview.size} file(s) flagged by secret review.`));
  }
  if (allowedFiles.length === 0) {
    console.log(pc.yellow('All files were skipped — nothing to push.'));
    return;
  }

  const subs = buildSubs({
    claudeDir: cfg.claudeDir,
    home: os.homedir(),
    extra: cfg.substitutions,
  });

  const deviceRoot = path.join(paths.hubDir, 'devices', cfg.device);
  const snapshotRoot = path.join(deviceRoot, 'snapshot');
  await fs.rm(snapshotRoot, { recursive: true, force: true });
  await fs.mkdir(snapshotRoot, { recursive: true });

  let byteCount = 0;
  for (const rel of allowedFiles) {
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
    fileCount: allowedFiles.length,
    byteCount,
  };
  await fs.writeFile(
    path.join(deviceRoot, 'version.json'),
    JSON.stringify(version, null, 2) + '\n',
  );

  await upsertDevice(paths.hubDir, version);

  const message =
    opts.message ?? `push: ${cfg.device} — ${allowedFiles.length} files`;
  const sha = await commitAndPush(paths.hubDir, message);
  if (!sha) {
    console.log(pc.yellow('Already up to date — nothing to push.'));
    return;
  }
  console.log(pc.green(`✓ pushed ${allowedFiles.length} files as ${cfg.device}@${sha.slice(0, 7)}`));
}

// ---------- secret review ----------

interface SecretDecision {
  abort: boolean;
  skipFiles: Set<string>;
}

function printScanReport(
  findings: SecretFinding[],
  visibility: HubVisibility,
  hubRemote: string,
): void {
  console.log();
  console.log(pc.red(`⚠  ${findings.length} potential secret finding(s) across your snapshot.`));
  const banner =
    visibility === 'public'
      ? pc.red(`   Hub is PUBLIC (${hubRemote}) — uploaded secrets are visible to anyone with access.`)
      : visibility === 'private'
        ? pc.dim(`   Hub appears private (GitHub isPrivate=true).`)
        : pc.yellow(`   Hub visibility UNKNOWN (non-GitHub host or gh unavailable) — treat as public.`);
  console.log(banner);
  console.log();

  const grouped = groupByFile(findings);
  for (const [file, hits] of grouped) {
    console.log(pc.cyan(`  ${file}`));
    for (const h of hits) {
      const loc = `L${String(h.line).padStart(3)}:${String(h.column).padEnd(3)}`;
      console.log(`    ${pc.dim(loc)} ${pc.yellow(h.label.padEnd(22))} ${pc.dim(h.preview)}`);
    }
  }
  console.log();
}

async function reviewSecrets(
  findings: SecretFinding[],
  visibility: HubVisibility,
  opts: PushOptions,
): Promise<SecretDecision> {
  const grouped = groupByFile(findings);
  const skipFiles = new Set<string>();

  if (opts.skipOnSecrets) {
    for (const file of grouped.keys()) skipFiles.add(file);
    console.log(
      pc.dim(`--skip-on-secrets: auto-skipping ${skipFiles.size} file(s) with detected findings.`),
    );
    return { abort: false, skipFiles };
  }

  if (!process.stdin.isTTY) {
    console.error(
      pc.red(
        'Secrets detected but stdin is not a TTY. Re-run interactively, or pass --skip-on-secrets / --allow-secrets.',
      ),
    );
    return { abort: true, skipFiles };
  }

  const dangerNote = visibility === 'private' ? '' : pc.red(' [hub not confirmed private]');

  for (const [file, hits] of grouped) {
    const response = await prompts(
      {
        type: 'select',
        name: 'action',
        message: `${file} — ${hits.length} finding(s)${dangerNote}`,
        choices: [
          { title: 'skip this file (do not upload)', value: 'skip' },
          {
            title:
              visibility === 'private'
                ? 'upload anyway'
                : 'upload anyway (secrets will travel to a non-private hub)',
            value: 'upload',
          },
          { title: 'abort entire push', value: 'abort' },
        ],
        initial: 0,
      },
      { onCancel: () => false },
    );

    const action = response.action as 'skip' | 'upload' | 'abort' | undefined;
    if (!action || action === 'abort') return { abort: true, skipFiles };
    if (action === 'skip') {
      skipFiles.add(file);
      continue;
    }

    // upload — require typed "yes" when visibility is not confirmed private
    if (visibility !== 'private') {
      const confirm = await prompts(
        {
          type: 'text',
          name: 'typed',
          message: pc.red(
            `Type "yes" to upload ${file} to a ${visibility === 'public' ? 'PUBLIC' : 'visibility-UNKNOWN'} hub`,
          ),
        },
        { onCancel: () => false },
      );
      const typed = String(confirm.typed ?? '').trim().toLowerCase();
      if (typed !== 'yes') {
        skipFiles.add(file);
        console.log(pc.dim(`  → not confirmed, skipping ${file}`));
      }
    }
  }

  return { abort: false, skipFiles };
}
