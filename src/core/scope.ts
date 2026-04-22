import fg from 'fast-glob';
import type { ScopeConfig } from '../types.js';

export const DEFAULT_SCOPE: ScopeConfig = {
  include: [
    'agents/**',
    'commands/**',
    'hooks/**',
    'skills/**',
    'rules/**',
    'mcp-configs/**',
    '*.md',
  ],
  optIn: [],
  excludeExtra: [],
};

const HARD_DENY = [
  'projects/**',
  'sessions/**',
  'session-data/**',
  'session-env/**',
  'shell-snapshots/**',
  'cache/**',
  'paste-cache/**',
  'telemetry/**',
  'backups/**',
  'file-history/**',
  'ide/**',
  'tasks/**',
  'downloads/**',
  'read-once/**',
  'metrics/**',
  'homunculus/**',
  'ecc/**',
  '.agents/**',
  '.omc/**',
  '**/*.log',
  '**/*.jsonl',
  '**/.credentials.json',
  '**/.env',
  '**/.env.*',
  '**/*credentials*',
  '**/*secret*',
  '**/.DS_Store',
];

export async function listScopedFiles(root: string, scope: ScopeConfig): Promise<string[]> {
  const include = scope.include.length ? scope.include : DEFAULT_SCOPE.include;
  const ignore = [...HARD_DENY, ...scope.excludeExtra];
  const matches = await fg(include, {
    cwd: root,
    ignore,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  return matches.sort();
}
