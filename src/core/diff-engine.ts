import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPatch } from 'diff';
import { isBinaryFile, walkFiles } from './fs-util.js';

export type FileStatus =
  | 'added'             // present in snapshot, absent locally — `pull` would create it
  | 'modified'          // present in both, text content differs after token resolution
  | 'binary-modified'   // present in both, binary content differs
  | 'deleted'           // present locally (within scope), absent from snapshot — `pull` does NOT remove
  | 'unchanged';        // byte-identical (text after resolution, or binary by hash)

export interface FileChange {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch: string | null;
}

export type DiffCounts = Record<FileStatus, number>;

export interface DiffSummary {
  changes: FileChange[];
  counts: DiffCounts;
}

export interface DiffInput {
  snapshotRoot: string;
  localRoot: string;
  localScoped: string[];
  resolveContent: (text: string) => string;
}

export async function diffTrees(input: DiffInput): Promise<DiffSummary> {
  const snapshotFiles = new Set(await walkFiles(input.snapshotRoot));
  const localFiles = new Set(input.localScoped);
  const allPaths = [...new Set<string>([...snapshotFiles, ...localFiles])].sort();

  const changes: FileChange[] = [];
  for (const rel of allPaths) {
    const inSnap = snapshotFiles.has(rel);
    const inLocal = localFiles.has(rel);
    if (inSnap && !inLocal) {
      changes.push(await describeAdded(input, rel));
    } else if (!inSnap && inLocal) {
      changes.push({ path: rel, status: 'deleted', additions: 0, deletions: 0, patch: null });
    } else {
      changes.push(await describeCompare(input, rel));
    }
  }

  const counts: DiffCounts = {
    added: 0,
    modified: 0,
    'binary-modified': 0,
    deleted: 0,
    unchanged: 0,
  };
  for (const c of changes) counts[c.status]++;

  return { changes, counts };
}

async function describeAdded(input: DiffInput, rel: string): Promise<FileChange> {
  const src = path.join(input.snapshotRoot, rel);
  if (await isBinaryFile(src)) {
    return { path: rel, status: 'added', additions: 0, deletions: 0, patch: null };
  }
  const raw = await fs.readFile(src, 'utf8');
  const resolved = input.resolveContent(raw);
  return { path: rel, status: 'added', additions: countLines(resolved), deletions: 0, patch: null };
}

async function describeCompare(input: DiffInput, rel: string): Promise<FileChange> {
  const snapPath = path.join(input.snapshotRoot, rel);
  const localPath = path.join(input.localRoot, rel);

  const [snapBinary, localBinary] = await Promise.all([
    isBinaryFile(snapPath),
    isBinaryFile(localPath),
  ]);

  if (snapBinary || localBinary) {
    const same = await sameBinary(snapPath, localPath);
    return {
      path: rel,
      status: same ? 'unchanged' : 'binary-modified',
      additions: 0,
      deletions: 0,
      patch: null,
    };
  }

  const [snapRaw, localRaw] = await Promise.all([
    fs.readFile(snapPath, 'utf8'),
    fs.readFile(localPath, 'utf8'),
  ]);
  const resolved = input.resolveContent(snapRaw);

  if (resolved === localRaw) {
    return { path: rel, status: 'unchanged', additions: 0, deletions: 0, patch: null };
  }

  // "old" = local (what we have now), "new" = resolved snapshot (what pull would produce).
  const patch = createPatch(rel, localRaw, resolved, 'local', 'after pull', { context: 3 });
  const { additions, deletions } = countPatchLines(patch);
  return { path: rel, status: 'modified', additions, deletions, patch };
}

async function sameBinary(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([fileHash(a), fileHash(b)]);
  return ha === hb;
}

async function fileHash(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function countLines(text: string): number {
  if (!text) return 0;
  const n = (text.match(/\n/g) ?? []).length;
  return text.endsWith('\n') ? n : n + 1;
}

function countPatchLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}
