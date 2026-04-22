import { describe, it, expect } from 'vitest';
import { scanContent, mask, groupByFile, DEFAULT_PATTERNS } from './secret-scanner.js';

describe('mask', () => {
  it('replaces short strings entirely', () => {
    expect(mask('short')).toBe('*****');
  });

  it('preserves head and tail of long strings', () => {
    expect(mask('sk-ant-api03-longvalue-hereAbcd1234')).toContain('sk-ant');
    expect(mask('sk-ant-api03-longvalue-hereAbcd1234').endsWith('1234')).toBe(true);
    expect(mask('sk-ant-api03-longvalue-hereAbcd1234')).toContain('…');
  });
});

describe('scanContent — vendor-specific patterns', () => {
  it('detects Anthropic API keys', () => {
    const content = 'ANTHROPIC_API_KEY=sk-ant-api03-12345abcdef67890ABCDEFGHijklmnopQRSTUVWXYZ\n';
    const hits = scanContent(content, 'env.sh');
    expect(hits.some((h) => h.patternId === 'anthropic-api-key')).toBe(true);
  });

  it('detects GitHub personal access tokens', () => {
    const content = 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz01";\n';
    const hits = scanContent(content, 'auth.ts');
    expect(hits.some((h) => h.patternId === 'github-token')).toBe(true);
  });

  it('detects OpenAI project keys', () => {
    const content = 'key=sk-proj-0123456789abcdefghij\n';
    const hits = scanContent(content, 'env');
    expect(hits.some((h) => h.patternId === 'openai-api-key')).toBe(true);
  });

  it('detects AWS access key IDs with word boundaries', () => {
    const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n';
    const hits = scanContent(content, 'aws.env');
    expect(hits.some((h) => h.patternId === 'aws-access-key')).toBe(true);
  });

  it('detects private key block headers', () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n';
    const hits = scanContent(content, 'id_rsa');
    expect(hits.some((h) => h.patternId === 'private-key-header')).toBe(true);
  });

  it('detects JWT-shaped tokens', () => {
    const content =
      'Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n';
    const hits = scanContent(content, 'req.log');
    expect(hits.some((h) => h.patternId === 'jwt')).toBe(true);
  });

  it('detects Bearer token assignments', () => {
    const content = 'Authorization: Bearer 0123456789abcdefghijklmnopqrstuvwxyz\n';
    const hits = scanContent(content, 'curl.sh');
    expect(hits.some((h) => h.patternId === 'bearer-token')).toBe(true);
  });

  it('detects generic api_key assignments', () => {
    const content = 'api_key = "abcdef0123456789ABCDEF"\n';
    const hits = scanContent(content, 'conf.toml');
    expect(hits.some((h) => h.patternId === 'generic-api-key')).toBe(true);
  });

  it('detects inline password literals', () => {
    const content = 'password: "hunter2-really-long-pass"\n';
    const hits = scanContent(content, 'conf.yaml');
    expect(hits.some((h) => h.patternId === 'inline-password')).toBe(true);
  });
});

describe('scanContent — benign content has zero findings', () => {
  it('does not flag ordinary markdown or shell', () => {
    const content = [
      '# Hooks',
      'Run `bash ~/.claude/hooks/format.sh` after saving.',
      'echo "hello ${USER}"',
      'if [ -f "$HOME/.bashrc" ]; then source "$HOME/.bashrc"; fi',
    ].join('\n');
    expect(scanContent(content, 'README.md')).toEqual([]);
  });

  it('does not flag short string literals that look like keys', () => {
    const content = 'const foo = "short";\nlet bar = "1234567890";\n';
    expect(scanContent(content, 'script.js')).toEqual([]);
  });

  it('does not flag our own tokenization placeholders', () => {
    const content = 'path=${HANDOFF_HOME}/.claude/hooks\n';
    expect(scanContent(content, 'env.sh')).toEqual([]);
  });
});

describe('scanContent — position tracking', () => {
  it('reports 1-based line and column', () => {
    const content =
      'line 1\n' + // 7 chars
      'line 2 sk-ant-api03-abcdefghijklmnopqrstuvwxyz01234567890AB end\n' +
      'line 3\n';
    const hits = scanContent(content, 'f.txt');
    const hit = hits.find((h) => h.patternId === 'anthropic-api-key');
    expect(hit?.line).toBe(2);
    expect(hit?.column).toBe('line 2 '.length + 1);
  });

  it('reports multiple matches on the same line', () => {
    const content =
      'a=sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA b=sk-ant-api03-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\n';
    const hits = scanContent(content, 'f.txt').filter((h) => h.patternId === 'anthropic-api-key');
    expect(hits).toHaveLength(2);
  });
});

describe('groupByFile', () => {
  it('groups findings by file and preserves order', () => {
    const content = 'sk-ant-api03-LONG-KEY-VALUE-ABCDEFGHIJKLMNOP-000000\n';
    const a = scanContent(content, 'a.txt');
    const b = scanContent(content, 'b.txt');
    const grouped = groupByFile([...a, ...b]);
    expect([...grouped.keys()]).toEqual(['a.txt', 'b.txt']);
  });
});

describe('DEFAULT_PATTERNS metadata', () => {
  it('has unique pattern ids', () => {
    const ids = DEFAULT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
