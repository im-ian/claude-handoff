import { Command } from 'commander';
import pc from 'picocolors';
import { initCommand } from './commands/init.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { statusCommand } from './commands/status.js';
import { diffCommand } from './commands/diff.js';

const program = new Command();

program
  .name('handoff')
  .description('Hand off your Claude Code setup between devices.')
  .version('0.0.1');

program
  .command('init')
  .description('Register this device and link a hub repository.')
  .option('--hub <url>', 'Hub repository URL')
  .option('--device <name>', 'Device name (default: hostname)')
  .option('--force', 'Overwrite existing config')
  .action(initCommand);

program
  .command('push')
  .description("Snapshot this device's Claude setup to the hub.")
  .option('-m, --message <msg>', 'Commit message override')
  .option('--allow-secrets', 'Bypass the secret scanner entirely (use only when you are sure)')
  .option('--skip-on-secrets', 'Non-interactive: auto-skip any file with detected secret findings')
  .action(pushCommand);

program
  .command('pull')
  .description("Apply a device's snapshot to this machine.")
  .option('--from <device>', 'Source device (default: this device)')
  .option('--dry-run', 'List files that would be written without applying')
  .action(pullCommand);

program
  .command('diff')
  .description('Preview what would change when pulling from a device.')
  .option('--from <device>', 'Source device (default: this device — useful as pre-push preview)')
  .option('-p, --patch', 'Include full unified diff for each modified file')
  .option('--files-only', 'List paths and markers only')
  .action(diffCommand);

program
  .command('status')
  .description('Show sync state for this device and the hub.')
  .action(statusCommand);

program.parseAsync().catch((err: Error) => {
  console.error(pc.red(err.message));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
