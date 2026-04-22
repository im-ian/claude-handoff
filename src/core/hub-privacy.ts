import { execa } from 'execa';

export type HubVisibility = 'private' | 'public' | 'unknown';

export interface ParsedGitHub {
  owner: string;
  repo: string;
}

const GITHUB_SSH = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/;
const GITHUB_HTTPS = /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/;

export function parseGitHubRemote(url: string): ParsedGitHub | null {
  const trimmed = url.trim();
  for (const re of [GITHUB_SSH, GITHUB_HTTPS]) {
    const m = trimmed.match(re);
    if (m && m[1] && m[2]) return { owner: m[1], repo: m[2] };
  }
  return null;
}

export async function detectHubVisibility(hubRemote: string): Promise<HubVisibility> {
  const gh = parseGitHubRemote(hubRemote);
  if (!gh) return 'unknown';
  try {
    const result = await execa('gh', ['repo', 'view', `${gh.owner}/${gh.repo}`, '--json', 'isPrivate'], {
      reject: false,
    });
    if (result.exitCode !== 0) return 'unknown';
    const data = JSON.parse(result.stdout) as { isPrivate?: boolean };
    if (typeof data.isPrivate !== 'boolean') return 'unknown';
    return data.isPrivate ? 'private' : 'public';
  } catch {
    return 'unknown';
  }
}
