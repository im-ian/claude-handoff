import { describe, it, expect } from 'vitest';
import { parseGitHubRemote } from './hub-privacy.js';

describe('parseGitHubRemote', () => {
  it('parses SSH form with .git suffix', () => {
    expect(parseGitHubRemote('git@github.com:im-ian/claude-handoff.git')).toEqual({
      owner: 'im-ian',
      repo: 'claude-handoff',
    });
  });

  it('parses SSH form without .git suffix', () => {
    expect(parseGitHubRemote('git@github.com:acme/widget-hub')).toEqual({
      owner: 'acme',
      repo: 'widget-hub',
    });
  });

  it('parses HTTPS form with embedded username', () => {
    expect(parseGitHubRemote('https://im-ian@github.com/im-ian/claude-handoff.git')).toEqual({
      owner: 'im-ian',
      repo: 'claude-handoff',
    });
  });

  it('parses HTTPS form without username', () => {
    expect(parseGitHubRemote('https://github.com/acme/widget-hub.git')).toEqual({
      owner: 'acme',
      repo: 'widget-hub',
    });
  });

  it('parses HTTPS form with trailing slash', () => {
    expect(parseGitHubRemote('https://github.com/acme/widget-hub/')).toEqual({
      owner: 'acme',
      repo: 'widget-hub',
    });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseGitHubRemote('git@gitlab.com:foo/bar.git')).toBeNull();
    expect(parseGitHubRemote('https://bitbucket.org/foo/bar.git')).toBeNull();
    expect(parseGitHubRemote('not a url')).toBeNull();
    expect(parseGitHubRemote('')).toBeNull();
  });
});
