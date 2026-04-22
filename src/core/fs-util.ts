import { promises as fs } from 'node:fs';
import path from 'node:path';

// Null-byte heuristic (same as git). Good enough for config/script/markdown vs. images/archives.
export async function isBinaryFile(file: string): Promise<boolean> {
  const fd = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, 8192, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } finally {
    await fd.close();
  }
}

export async function copyFileEnsureDir(src: string, dst: string): Promise<void> {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(rel: string): Promise<void> {
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    for (const e of entries) {
      const sub = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) await visit(sub);
      else if (e.isFile()) out.push(sub);
    }
  }
  try {
    await visit('');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return out.sort();
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
