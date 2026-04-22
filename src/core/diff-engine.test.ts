import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { diffTrees } from './diff-engine.js';

const identity = (t: string) => t;

async function mkTemp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'claude-handoff-diff-'));
}

async function write(root: string, rel: string, content: string | Buffer): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function cleanup(...dirs: string[]): Promise<void> {
  await Promise.all(dirs.map((d) => fs.rm(d, { recursive: true, force: true })));
}

describe('diffTrees', () => {
  let snap = '';
  let local = '';

  beforeEach(async () => {
    snap = await mkTemp();
    local = await mkTemp();
  });

  afterEach(async () => {
    await cleanup(snap, local);
  });

  it('classifies added / modified / deleted / unchanged', async () => {
    await write(snap, 'hooks/a.sh', 'echo A v2\n');
    await write(snap, 'hooks/b.sh', 'echo B\n');
    await write(snap, 'rules/new.md', 'new rule\n');

    await write(local, 'hooks/a.sh', 'echo A v1\n');
    await write(local, 'hooks/b.sh', 'echo B\n');
    await write(local, 'hooks/local-only.sh', 'echo stay\n');

    const { changes, counts } = await diffTrees({
      snapshotRoot: snap,
      localRoot: local,
      localScoped: ['hooks/a.sh', 'hooks/b.sh', 'hooks/local-only.sh'],
      resolveContent: identity,
    });

    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));
    expect(byPath['hooks/a.sh']?.status).toBe('modified');
    expect(byPath['hooks/b.sh']?.status).toBe('unchanged');
    expect(byPath['hooks/local-only.sh']?.status).toBe('deleted');
    expect(byPath['rules/new.md']?.status).toBe('added');
    expect(counts).toMatchObject({ added: 1, modified: 1, deleted: 1, unchanged: 1 });
  });

  it('applies resolveContent before comparing — tokenized snapshot matches local after resolution', async () => {
    await write(snap, 'hooks/path.sh', 'path=${HANDOFF_HOME}/data\n');
    await write(local, 'hooks/path.sh', 'path=/Users/home-ian/data\n');

    const { counts } = await diffTrees({
      snapshotRoot: snap,
      localRoot: local,
      localScoped: ['hooks/path.sh'],
      resolveContent: (t) => t.split('${HANDOFF_HOME}').join('/Users/home-ian'),
    });

    expect(counts.unchanged).toBe(1);
    expect(counts.modified).toBe(0);
  });

  it('produces a unified patch with accurate additions/deletions', async () => {
    await write(snap, 'f.txt', 'a\nb\nc\nd\n');
    await write(local, 'f.txt', 'a\nX\nc\n');

    const { changes } = await diffTrees({
      snapshotRoot: snap,
      localRoot: local,
      localScoped: ['f.txt'],
      resolveContent: identity,
    });

    const c = changes[0];
    expect(c?.status).toBe('modified');
    expect(c?.additions).toBeGreaterThan(0);
    expect(c?.deletions).toBeGreaterThan(0);
    expect(c?.patch).toContain('-X');
    expect(c?.patch).toContain('+b');
    expect(c?.patch).toContain('+d');
  });

  it('compares binary files by hash, not by text diff', async () => {
    const buf1 = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const buf2 = Buffer.from([0x00, 0x01, 0x02, 0x04]);
    await write(snap, 'bin/x.dat', buf1);
    await write(local, 'bin/x.dat', buf2);

    const { changes } = await diffTrees({
      snapshotRoot: snap,
      localRoot: local,
      localScoped: ['bin/x.dat'],
      resolveContent: identity,
    });

    expect(changes[0]?.status).toBe('binary-modified');
    expect(changes[0]?.patch).toBeNull();
  });

  it('identical binary files are unchanged', async () => {
    const buf = Buffer.from([0x00, 0xff, 0x7f]);
    await write(snap, 'bin/y.dat', buf);
    await write(local, 'bin/y.dat', buf);

    const { counts } = await diffTrees({
      snapshotRoot: snap,
      localRoot: local,
      localScoped: ['bin/y.dat'],
      resolveContent: identity,
    });

    expect(counts.unchanged).toBe(1);
    expect(counts['binary-modified']).toBe(0);
  });

  it('handles empty snapshot (all local files become deleted)', async () => {
    await write(local, 'rules/a.md', 'x\n');
    await write(local, 'rules/b.md', 'y\n');

    const { counts } = await diffTrees({
      snapshotRoot: snap,
      localRoot: local,
      localScoped: ['rules/a.md', 'rules/b.md'],
      resolveContent: identity,
    });

    expect(counts.deleted).toBe(2);
    expect(counts.added).toBe(0);
  });

  it('handles missing local root (all snapshot files become added)', async () => {
    await write(snap, 'a.md', 'hi\n');
    await write(snap, 'b.md', 'yo\n');

    const { counts } = await diffTrees({
      snapshotRoot: snap,
      localRoot: path.join(local, 'does-not-exist'),
      localScoped: [],
      resolveContent: identity,
    });

    expect(counts.added).toBe(2);
  });
});
