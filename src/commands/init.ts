import os from 'node:os';
import path from 'node:path';
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
  if (existing && !opts.force) {
    console.log(pc.yellow(`Already initialized as device "${existing.device}".`));
    console.log(pc.dim('Use --force to re-initialize (config will be overwritten).'));
    return;
  }

  const defaultDevice = os.hostname().replace(/\..*$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const claudeDir = path.join(os.homedir(), '.claude');

  const answers = await prompts(
    [
      {
        type: opts.hub ? null : 'text',
        name: 'hubRemote',
        message: 'Hub repo URL (e.g. git@github.com:you/my-claude-hub.git)',
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
    substitutions: [],
    scope: structuredClone(DEFAULT_SCOPE),
    secretPolicy: { allow: [] },
  };

  await writeConfig(config);
  console.log(pc.green(`✓ wrote ${paths.configFile}`));

  if (opts.skipClone) {
    console.log(pc.dim(`--skip-clone: skipping hub clone (useful for dry-run setups).`));
  } else {
    console.log(pc.dim(`Cloning hub into ${paths.hubDir}…`));
    try {
      await ensureClone(paths.hubDir, hubRemote);
      console.log(pc.green(`✓ hub ready`));
    } catch (err) {
      console.log(pc.yellow(`⚠ hub clone failed: ${(err as Error).message}`));
      console.log(pc.dim(`  Config is written; fix the hub URL or re-run with --skip-clone to continue.`));
    }
  }

  console.log();
  console.log(pc.bold('Next:'));
  console.log(`  ${pc.cyan('handoff push')}                    ${pc.dim('— send this machine’s setup to the hub')}`);
  console.log(`  ${pc.cyan('handoff pull --from <device>')}    ${pc.dim('— apply another machine’s setup here')}`);
  console.log(`  ${pc.cyan('handoff status')}                  ${pc.dim('— show sync state and known devices')}`);
}
