import { describe, it, expect } from 'vitest';
import { buildSubs, tokenize, resolve, TOKENS } from './tokenize.js';

const macIdentity = {
  claudeDir: '/Users/jthefloor/.claude',
  home: '/Users/jthefloor',
  extra: [],
};

const workIdentity = {
  claudeDir: '/Users/ian.lee/.claude',
  home: '/Users/ian.lee',
  extra: [],
};

describe('buildSubs', () => {
  it('orders longest "from" first (claudeDir before home)', () => {
    const subs = buildSubs(macIdentity);
    expect(subs[0]?.from).toBe('/Users/jthefloor/.claude');
    expect(subs[1]?.from).toBe('/Users/jthefloor');
  });

  it('does not include bare USER / HOSTNAME by default', () => {
    const subs = buildSubs(macIdentity);
    expect(subs.find((s) => s.to === TOKENS.USER)).toBeUndefined();
    expect(subs.find((s) => s.to === TOKENS.HOSTNAME)).toBeUndefined();
  });

  it('appends extra substitutions and re-sorts', () => {
    const subs = buildSubs({
      ...macIdentity,
      extra: [{ from: 'jthefloor', to: TOKENS.USER }],
    });
    expect(subs[0]?.from).toBe('/Users/jthefloor/.claude');
    const user = subs.find((s) => s.to === TOKENS.USER);
    expect(user?.from).toBe('jthefloor');
  });

  it('filters empty substitutions', () => {
    const subs = buildSubs({
      ...macIdentity,
      extra: [{ from: '', to: 'x' }, { from: 'x', to: '' }],
    });
    expect(subs.some((s) => !s.from || !s.to)).toBe(false);
  });
});

describe('tokenize → resolve is round-trip stable across devices', () => {
  it('hooks with absolute claude path survive mac → work-pc round trip', () => {
    const subsMac = buildSubs(macIdentity);
    const subsWork = buildSubs(workIdentity);

    const original = JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            command: 'bash /Users/jthefloor/.claude/hooks/format.sh',
            description: 'Format saved files',
          },
        ],
      },
    });

    const tokenized = tokenize(original, subsMac);
    expect(tokenized).toContain(TOKENS.CLAUDE);
    expect(tokenized).not.toContain('jthefloor');

    const resolvedOnWork = resolve(tokenized, subsWork);
    expect(resolvedOnWork).toContain('/Users/ian.lee/.claude/hooks/format.sh');
    expect(resolvedOnWork).not.toContain('jthefloor');
    expect(resolvedOnWork).not.toContain('HANDOFF_');
  });

  it('does not clobber home path when claude path matches first', () => {
    const subs = buildSubs(macIdentity);
    const input = 'CLAUDE=/Users/jthefloor/.claude\nHOME=/Users/jthefloor\n';
    const tokenized = tokenize(input, subs);
    expect(tokenized).toBe(
      `CLAUDE=${TOKENS.CLAUDE}\nHOME=${TOKENS.HOME}\n`,
    );
  });

  it('preserves content without any device literals', () => {
    const subs = buildSubs(macIdentity);
    const input = 'echo "hello world"\nrelative/path/here\n';
    expect(tokenize(input, subs)).toBe(input);
    expect(resolve(input, subs)).toBe(input);
  });

  it('round-trips identity when source and target share identity', () => {
    const subs = buildSubs(macIdentity);
    const input = '/Users/jthefloor/.claude/hooks/x.sh — home: /Users/jthefloor';
    expect(resolve(tokenize(input, subs), subs)).toBe(input);
  });
});

describe('opt-in USER substitution', () => {
  it('tokenizes standalone username when user explicitly opts in', () => {
    const subs = buildSubs({
      ...macIdentity,
      extra: [{ from: 'jthefloor', to: TOKENS.USER }],
    });
    const input = 'user=jthefloor';
    expect(tokenize(input, subs)).toBe(`user=${TOKENS.USER}`);
  });
});
