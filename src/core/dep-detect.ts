import path from 'node:path';
import { promises as fs } from 'node:fs';

// Tools that ship with macOS / typical Linux installs — not worth flagging as
// missing dependencies. `git` is here because `handoff` itself requires it,
// so by the time anyone runs `doctor` we know git exists.
const SYSTEM_TOOLS = new Set([
  // shells
  'bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh',
  // posix essentials
  'cat', 'echo', 'cd', 'ls', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv',
  'find', 'grep', 'egrep', 'fgrep', 'sed', 'awk', 'cut', 'tr', 'sort',
  'uniq', 'head', 'tail', 'xargs', 'wc', 'tee', 'tar', 'gzip', 'gunzip',
  'true', 'false', 'test', '[', 'expr', 'date', 'env', 'export', 'source',
  '.', 'exit', 'eval', 'exec', 'readlink', 'basename', 'dirname',
  'which', 'type', 'command', 'hash', 'alias', 'unalias',
  'sleep', 'kill', 'ps', 'jobs', 'fg', 'bg', 'wait', 'trap',
  'mktemp', 'touch', 'chmod', 'chown', 'ln', 'stat', 'file', 'sudo',
  // common networking that's nearly always present
  'curl', 'wget', 'ping', 'nc', 'ssh', 'scp', 'rsync',
  // git is required by handoff itself
  'git',
]);

export interface DepRef {
  binary: string;
  file: string;       // relative to claudeDir, e.g. "hooks/hooks.json"
  line?: number;
  context: string;    // the offending command line (truncated)
}

/**
 * Walk a parsed JSON tree and collect every string value associated with a
 * `command` key. Hooks JSON varies in shape so we walk recursively rather
 * than assuming a fixed schema.
 */
function collectCommandFields(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectCommandFields(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.command === 'string') out.push(obj.command);
    for (const v of Object.values(obj)) collectCommandFields(v, out);
  }
}

/**
 * From a command line, return the executable token. Examples:
 *   `node "${HANDOFF_CLAUDE}/scripts/hooks/x.js"` -> "node"
 *   `clawd format --strict`                        -> "clawd"
 *   `/usr/local/bin/foo arg`                       -> "foo" (basename)
 *   `${SOMETHING} arg`                             -> null (env-driven, can't map)
 */
function extractExecutable(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (!trimmed) return null;
  // First token, accounting for a single matching quote
  const m = trimmed.match(/^(["']?)([^"'\s]+)\1/);
  if (!m) return null;
  const first = m[2]!;
  if (first.startsWith('$') || first.startsWith('~')) return null;
  if (first.includes('/')) return path.basename(first);
  return first;
}

/**
 * Best-effort line-number lookup by re-scanning the raw text. Cheap and
 * good-enough for diagnostic output — we don't need a real JSON path tracker.
 */
function findLine(raw: string, snippet: string): number | undefined {
  const needle = snippet.length > 40 ? snippet.slice(0, 40) : snippet;
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) return i + 1;
  }
  return undefined;
}

export async function detectDeps(claudeDir: string): Promise<DepRef[]> {
  const refs: DepRef[] = [];
  const hooksFile = path.join(claudeDir, 'hooks', 'hooks.json');

  let raw: string;
  try {
    raw = await fs.readFile(hooksFile, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return refs;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refs;
  }

  const commands: string[] = [];
  collectCommandFields(parsed, commands);

  for (const cmd of commands) {
    const exe = extractExecutable(cmd);
    if (!exe) continue;
    if (SYSTEM_TOOLS.has(exe)) continue;
    refs.push({
      binary: exe,
      file: 'hooks/hooks.json',
      line: findLine(raw, cmd),
      context: cmd.length > 100 ? cmd.slice(0, 97) + '...' : cmd,
    });
  }

  return refs;
}

export function groupByBinary(refs: DepRef[]): Map<string, DepRef[]> {
  const grouped = new Map<string, DepRef[]>();
  for (const ref of refs) {
    const list = grouped.get(ref.binary) ?? [];
    list.push(ref);
    grouped.set(ref.binary, list);
  }
  return grouped;
}
