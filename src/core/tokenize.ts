import type { Substitution } from '../types.js';

export const TOKENS = {
  CLAUDE: '${HANDOFF_CLAUDE}',
  HOME: '${HANDOFF_HOME}',
  USER: '${HANDOFF_USER}',
  HOSTNAME: '${HANDOFF_HOSTNAME}',
} as const;

export interface DeviceIdentity {
  claudeDir: string;
  home: string;
  extra: Substitution[];
}

// Longest `from` first so that `/Users/jthefloor/.claude` matches before `/Users/jthefloor`.
// Note: HANDOFF_USER / HANDOFF_HOSTNAME tokens are defined above but intentionally
// excluded from default substitutions — bare username/hostname strings can collide
// with unrelated words in comments, commit messages, or natural-language content.
// Opt in via config.substitutions if your hooks truly need them.
export function buildSubs(id: DeviceIdentity): Substitution[] {
  const base: Substitution[] = [
    { from: id.claudeDir, to: TOKENS.CLAUDE },
    { from: id.home, to: TOKENS.HOME },
  ];
  return [...base, ...id.extra]
    .filter((s) => s.from && s.to)
    .sort((a, b) => b.from.length - a.from.length);
}

export function tokenize(content: string, subs: Substitution[]): string {
  let out = content;
  for (const s of subs) out = replaceAllLiteral(out, s.from, s.to);
  return out;
}

export function resolve(content: string, subs: Substitution[]): string {
  let out = content;
  // token → literal is order-insensitive since tokens are disjoint.
  for (const s of subs) out = replaceAllLiteral(out, s.to, s.from);
  return out;
}

function replaceAllLiteral(src: string, find: string, replace: string): string {
  if (!find) return src;
  return src.split(find).join(replace);
}
