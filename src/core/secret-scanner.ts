import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isBinaryFile } from './fs-util.js';

export interface SecretPattern {
  id: string;
  label: string;
  regex: RegExp;
}

export interface SecretFinding {
  file: string;       // relative path
  line: number;       // 1-based
  column: number;     // 1-based
  patternId: string;
  label: string;
  preview: string;    // masked — shows head...tail
}

// Ordered for UX: more specific vendor prefixes before generic heuristics.
// Regexes use /g so indices update across matches within a line.
export const DEFAULT_PATTERNS: readonly SecretPattern[] = Object.freeze([
  { id: 'anthropic-api-key', label: 'Anthropic API key', regex: /sk-ant-[A-Za-z0-9_-]{30,}/g },
  { id: 'openai-api-key', label: 'OpenAI API key', regex: /sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}/g },
  { id: 'github-token', label: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
  { id: 'slack-token', label: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { id: 'google-api-key', label: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { id: 'aws-access-key', label: 'AWS access key ID', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    id: 'private-key-header',
    label: 'Private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'jwt',
    label: 'JWT token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  { id: 'bearer-token', label: 'Bearer token', regex: /\bBearer\s+[A-Za-z0-9_\-.=]{24,}/g },
  {
    id: 'generic-api-key',
    label: 'Generic api key',
    regex: /\b(?:api[_-]?key|apikey|api[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9_\-]{20,})["']?/gi,
  },
  {
    id: 'inline-password',
    label: 'Inline password',
    regex: /\b(?:password|passwd|pwd)\s*[:=]\s*["']([^\s"']{8,})["']/gi,
  },
]);

const MAX_SCAN_BYTES = 2 * 1024 * 1024; // 2MB — files larger than this are logs/data, not config.

export async function scanFile(
  absPath: string,
  rel: string,
  patterns: readonly SecretPattern[] = DEFAULT_PATTERNS,
): Promise<SecretFinding[]> {
  const stat = await fs.stat(absPath);
  if (stat.size === 0 || stat.size > MAX_SCAN_BYTES) return [];
  if (await isBinaryFile(absPath)) return [];
  const content = await fs.readFile(absPath, 'utf8');
  return scanContent(content, rel, patterns);
}

export function scanContent(
  content: string,
  rel: string,
  patterns: readonly SecretPattern[] = DEFAULT_PATTERNS,
): SecretFinding[] {
  if (!content) return [];
  const findings: SecretFinding[] = [];
  const lineStarts = buildLineStarts(content);

  for (const pattern of patterns) {
    // Fresh regex to reset lastIndex between files; DEFAULT_PATTERNS are shared.
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const offset = match.index;
      const { line, column } = offsetToLineCol(offset, lineStarts);
      findings.push({
        file: rel,
        line,
        column,
        patternId: pattern.id,
        label: pattern.label,
        preview: mask(match[0]),
      });
      if (match[0].length === 0) re.lastIndex++; // guard against zero-width infinite loop
    }
  }

  // Sort by line/column for stable display.
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}

export async function scanFiles(
  root: string,
  rels: readonly string[],
  patterns: readonly SecretPattern[] = DEFAULT_PATTERNS,
): Promise<SecretFinding[]> {
  const out: SecretFinding[] = [];
  for (const rel of rels) {
    const hits = await scanFile(path.join(root, rel), rel, patterns);
    out.push(...hits);
  }
  return out;
}

export function mask(value: string): string {
  const s = value.trim();
  if (s.length <= 12) return '*'.repeat(s.length);
  const head = s.slice(0, 6);
  const tail = s.slice(-4);
  return `${head}…${tail}`;
}

export function groupByFile(findings: readonly SecretFinding[]): Map<string, SecretFinding[]> {
  const map = new Map<string, SecretFinding[]>();
  for (const f of findings) {
    const arr = map.get(f.file) ?? [];
    arr.push(f);
    map.set(f.file, arr);
  }
  return map;
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function offsetToLineCol(offset: number, lineStarts: readonly number[]): { line: number; column: number } {
  // Binary search for the greatest lineStart <= offset.
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const v = lineStarts[mid]!;
    if (v <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}
