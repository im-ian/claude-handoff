# Publishing & marketplace submission

This document is the owner's runbook for shipping `claude-handoff` to end users.

## Prerequisites

- npm account with access to the `@im-ian` scope (if the scope doesn't exist yet, it's created automatically on first publish while logged in as `im-ian`).
- GitHub access to `anthropics/claude-plugins-official` (anyone can fork).
- Clean working tree: `git status` shows no uncommitted changes.
- All tests green: `pnpm test` reports 40+ passing.

## 1. Publish the CLI to npm

### First-time setup

```bash
npm login                 # walks through browser auth; verify with `npm whoami`
```

### Ship a version

```bash
# bump the version — choose one:
npm version patch        # 0.0.1 → 0.0.2
npm version minor        # 0.0.1 → 0.1.0
npm version major        # 0.0.1 → 1.0.0

# build a fresh dist
npm run build

# dry-run to inspect what will actually ship
npm publish --dry-run

# ship for real (--access public is already in publishConfig but we pass it explicitly)
npm publish --access public
```

After a successful publish:

```bash
npm view @im-ian/claude-handoff    # verify metadata
git push --follow-tags              # push version commit + tag
```

### Post-publish verification

From a fresh machine (or a scratch shell):

```bash
npm install -g @im-ian/claude-handoff
handoff --version
```

## 2. Update the README install instructions

Once published, the README already points at `npm install -g @im-ian/claude-handoff` as the future path. No edit needed unless the name or scope changes.

## 3. Submit to the official Claude Code marketplace

The Anthropic-curated marketplace lives at [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official). Third-party plugins go in `/external_plugins` and are listed in `.claude-plugin/marketplace.json`.

### Prepare the entry

Use this JSON fragment (targeted at the marketplace.json `plugins` array). The `sha` pin ensures users of the official marketplace always install a specific commit — bump it each time you publish a new release:

```json
{
  "name": "claude-handoff",
  "description": "Sync your Claude Code setup across devices — device-aware path tokenization, secret scanning, and a shared hub repo with N:M versioning.",
  "category": "productivity",
  "author": {
    "name": "im-ian"
  },
  "source": {
    "source": "url",
    "url": "https://github.com/im-ian/claude-handoff.git",
    "sha": "<fill-in-the-release-commit-sha>"
  },
  "homepage": "https://github.com/im-ian/claude-handoff"
}
```

Get the commit SHA to pin:

```bash
git rev-parse HEAD            # or the tag you just pushed
```

### Submit the PR

```bash
# fork the upstream marketplace
gh repo fork anthropics/claude-plugins-official --clone
cd claude-plugins-official

# create a branch
git checkout -b add-claude-handoff

# edit .claude-plugin/marketplace.json — insert your entry in the `plugins` array,
# keeping the array sorted alphabetically by `name` to match the existing convention.
# then stage + commit:
git add .claude-plugin/marketplace.json
git commit -m "feat: add claude-handoff plugin"

git push -u origin add-claude-handoff
gh pr create --repo anthropics/claude-plugins-official \
  --title "Add claude-handoff" \
  --body "Adds claude-handoff — a cross-device sync tool for \`~/.claude/\` setups. Tokenizes device-specific paths so hooks survive username changes between machines, scans for secrets before upload, and uses a shared hub repo for N:M versioning. Repo: https://github.com/im-ian/claude-handoff"
```

Anthropic reviews third-party entries. Expect a review turnaround of a few days; they may request changes (description tweaks, homepage verification, etc.).

## 4. Updating later versions

### npm

```bash
npm version patch
npm run build
npm publish
git push --follow-tags
```

### Official marketplace

Users who installed via the official marketplace pull updates when **either** the upstream `anthropics/claude-plugins-official` marketplace.json bumps the `sha`, or when they run `/plugin update` if the source entry has no `sha` pin.

To issue a new release through the official marketplace:

1. Get the latest commit SHA: `git rev-parse HEAD`
2. Open a new PR against `anthropics/claude-plugins-official` updating the `sha` field in your existing entry.

### Own marketplace (`im-ian/claude-handoff`)

No submission required — users pulling from `/plugin marketplace add im-ian/claude-handoff` track `main` automatically. `/plugin update` fetches whatever is at `HEAD`.

## Rollback

### npm

npm publishes are append-only; you cannot "delete" a published version once it's been installed by anyone. Options:

- `npm deprecate @im-ian/claude-handoff@<bad-version> "reason"` — shows a warning on install but doesn't remove the version.
- `npm unpublish @im-ian/claude-handoff@<bad-version>` — only allowed within 72 hours of publish, only if nothing else depends on it. **Avoid** unless the release contained secrets.
- Publish a patch release that reverts the broken change — preferred.

### Marketplace

Update the `sha` in `anthropics/claude-plugins-official`'s marketplace.json to a known-good commit, submitted via a new PR.

## Open release checklist template

Copy this into a GitHub release or tag annotation:

```
- [ ] All tests pass (pnpm test)
- [ ] CHANGELOG updated
- [ ] npm version bumped
- [ ] dist rebuilt (npm run build)
- [ ] Published to npm (npm publish)
- [ ] Tag pushed (git push --follow-tags)
- [ ] Official marketplace PR opened/updated with new sha
- [ ] Smoke test: npm install -g @im-ian/claude-handoff && handoff --version on a clean machine
```
