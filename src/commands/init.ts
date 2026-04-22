import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import prompts from 'prompts';
import pc from 'picocolors';
import { paths, readConfig, writeConfig } from '../core/config.js';
import { ensureClone } from '../core/git.js';
import { DEFAULT_SCOPE } from '../core/scope.js';
import { pathExists } from '../core/fs-util.js';
import type { DeviceConfig } from '../types.js';

export interface InitOptions {
  hub?: string;
  device?: string;
  force?: boolean;
  skipClone?: boolean;
}

const DEVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function initCommand(opts: InitOptions): Promise<void> {
  const existing = await readConfig();
  const isUpdate = existing !== null;
  // Preserve scope/secretPolicy/substitutions on an update unless --force is passed.
  const keepEditable = isUpdate && !opts.force;

  if (isUpdate) {
    if (opts.force) {
      console.log(
        pc.yellow(
          `--force: overwriting config for "${existing.device}" and resetting scope, secretPolicy, and substitutions to defaults.`,
        ),
      );
    } else {
      console.log(
        pc.dim(
          `Existing config found for "${existing.device}". Updating — press Enter on prompts to keep current values. Pass --force to also reset scope/secretPolicy/substitutions.`,
        ),
      );
    }
  }

  const hostDefault = os
    .hostname()
    .replace(/\..*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  const defaultDevice = keepEditable ? existing!.device : hostDefault;
  const defaultHub = keepEditable ? existing!.hubRemote : '';
  const claudeDir = existing?.claudeDir ?? path.join(os.homedir(), '.claude');

  const answers = await prompts(
    [
      {
        type: opts.hub ? null : 'text',
        name: 'hubRemote',
        message: 'Hub repo URL (e.g. git@github.com:you/my-claude-hub.git)',
        initial: defaultHub,
        validate: (v: string) => (v.trim().length > 0 ? true : 'Required'),
      },
      {
        type: opts.device ? null : 'text',
        name: 'device',
        message: 'Device name',
        initial: defaultDevice,
        validate: (v: string) =>
          DEVICE_NAME_PATTERN.test(v) ? true : 'lowercase letters, digits, hyphens; must start with a letter/digit',
      },
    ],
    { onCancel: () => process.exit(1) },
  );

  const hubRemote = (opts.hub ?? answers.hubRemote).trim();
  const device = (opts.device ?? answers.device).trim();

  if (!DEVICE_NAME_PATTERN.test(device)) {
    console.error(pc.red(`Invalid device name "${device}".`));
    process.exit(1);
  }

  if (!(await pathExists(claudeDir))) {
    console.log(pc.yellow(`⚠ ${claudeDir} does not exist yet — it will be created on first pull.`));
  }

  const config: DeviceConfig = {
    device,
    hubRemote,
    claudeDir,
    substitutions: keepEditable ? existing!.substitutions : [],
    scope: keepEditable ? existing!.scope : structuredClone(DEFAULT_SCOPE),
    secretPolicy: keepEditable ? existing!.secretPolicy : { allow: [] },
  };

  await writeConfig(config);
  console.log(pc.green(`✓ wrote ${paths.configFile}`));

  // Summarize what actually changed on an update so the user can spot mistakes quickly.
  if (isUpdate) {
    const changes: string[] = [];
    if (existing!.device !== device) changes.push(`device: ${existing!.device} → ${device}`);
    if (existing!.hubRemote !== hubRemote) changes.push(`hub: ${existing!.hubRemote} → ${hubRemote}`);
    if (opts.force) changes.push('scope/secretPolicy/substitutions: reset to defaults');
    if (changes.length > 0) {
      console.log(pc.dim('  changed: ' + changes.join('; ')));
    } else {
      console.log(pc.dim('  no changes — config is identical to before.'));
    }
  }

  // If the hub URL moved, nuke the old clone — its working tree and object store
  // belong to a different repo and will confuse `push` on the next run.
  const hubChanged = isUpdate && existing!.hubRemote !== hubRemote;
  if (hubChanged && (await pathExists(paths.hubDir))) {
    console.log(pc.dim(`Hub URL changed — removing stale clone at ${paths.hubDir}.`));
    await fs.rm(paths.hubDir, { recursive: true, force: true });
  }

  if (opts.skipClone) {
    console.log(pc.dim(`--skip-clone: skipping hub clone (useful for dry-run setups).`));
  } else {
    console.log(pc.dim(`Cloning hub into ${paths.hubDir}…`));
    try {
      await ensureClone(paths.hubDir, hubRemote);
      console.log(pc.green(`✓ hub ready`));
    } catch (err) {
      console.log(pc.yellow(`⚠ hub clone failed: ${(err as Error).message}`));
      console.log(
        pc.dim(
          `  Config is written; fix the hub URL or re-run with --skip-clone to continue.`,
        ),
      );
    }
  }

  console.log();
  if (isUpdate) {
    console.log(pc.bold('Updated. Next:'));
  } else {
    console.log(pc.bold('Next:'));
  }
  console.log(
    `  ${pc.cyan('handoff push')}                    ${pc.dim("— send this machine's setup to the hub")}`,
  );
  console.log(
    `  ${pc.cyan('handoff pull --from <device>')}    ${pc.dim("— apply another machine's setup here")}`,
  );
  console.log(
    `  ${pc.cyan('handoff status')}                  ${pc.dim('— show sync state and known devices')}`,
  );
}
