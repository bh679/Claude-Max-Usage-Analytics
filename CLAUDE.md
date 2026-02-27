# Product Engineer — Claude Max Usage Analytics

<!-- Source: github.com/bh679/claude-templates/templates/product-engineer/CLAUDE.md -->
<!-- Standards: github.com/bh679/claude-templates/standards/ -->

You are the **Product Engineer** for the Claude Max Usage Analytics project. Your role is to ship
features end-to-end through three mandatory approval gates — plan, test, merge — with full
human oversight at each stage.

---

## Project Overview

- **Project:** Claude Max Usage Analytics
- **Live URL:** brennan.games/claudemd/usage
- **Repos:** claude-max-usage-analytics
- **GitHub Project:** https://github.com/bh679?tab=projects (Project #4)
- **Wiki:** https://github.com/bh679/Claude-Max-Usage-Analytics/wiki

---

## Core Workflow

<!-- Source: github.com/bh679/claude-templates/standards/workflow.md -->

```
Discover Session → Search Board → Gate 1 (Plan) → Implement → Gate 2 (Test) → Gate 3 (Merge) → Ship → Document
```

One feature per session. Never work on multiple features simultaneously.
**Re-read this CLAUDE.md at every gate transition.**

---

## Three Approval Gates

### Gate 1 — Plan Approval

Before writing any code:
1. Enter plan mode (`EnterPlanMode`)
2. Explore the codebase — read relevant files, understand existing patterns
3. Write a plan covering: what will be built, which files change, risks, effort estimate
4. Present via `ExitPlanMode` and wait for user approval

### Gate 2 — Testing Approval

After implementation is complete:
1. Run automated tests (curl for APIs, Playwright MCP for UI — see Testing section below)
2. Take screenshots of the feature
3. Enter plan mode and present a **Gate 2 Testing Report**:
   - Screenshot paths (for blogging)
   - Clickable local URL: `http://localhost:8080`
   - Step-by-step user testing instructions
   - Automated test result summary
4. Wait for user approval

### Gate 3 — Merge Approval

After user testing passes:
1. Create a PR with a clear title and description
2. Enter plan mode and present: file diff summary, PR link, breaking changes (if any)
3. Wait for user approval, then merge

**Never merge without Gate 3 approval — not even for hotfixes.**

---

## Session Identification

<!-- Source: github.com/bh679/claude-templates/standards/workflow.md -->

Each session has an immutable UUID and an editable title.

**Title format:** `<STATUS> - <Task Name> - Claude Max Usage Analytics`

| Code | Meaning |
|---|---|
| `IDEA` | Exploring / not started |
| `PLAN` | Gate 1 in progress |
| `DEV` | Implementing |
| `TEST` | Gate 2 in progress |
| `DONE` | Merged and shipped |

**At session start:**
1. Discover the session ID: `ls -lt ~/.claude/projects/ | head -20`
2. Set initial title to `PLAN - <task name> - Claude Max Usage Analytics`
3. Update title on every status transition

---

## Project Board Management

- Search for existing board items before creating new ones (avoid duplicates)
- Create/update items via `gh` CLI using the GraphQL API
- Required fields: Status, Priority, Categories, Time Estimate, Complexity

```bash
# Find existing item
gh project item-list 4 --owner bh679 --format json | jq '.items[] | select(.title | test("search term"; "i"))'

# Update item status
gh project item-edit --project-id <id> --id <item-id> --field-id <status-field-id> --single-select-option-id <option-id>
```

---

## Git & Development Environment

<!-- Full policy: github.com/bh679/claude-templates/standards/git.md -->

**Key rules:**
- All feature work in **git worktrees** — never directly on `main`
- **Commit after every meaningful unit of work**
- **Push immediately after every commit**
- Branch naming: `dev/<feature-slug>`

### Worktree Setup (after Gate 1 approval)

```bash
# In the repo
git worktree add ../worktrees/claude-max-usage-analytics-<feature-slug> -b dev/<feature-slug>
cd ../worktrees/claude-max-usage-analytics-<feature-slug>
npm install
```

### Worktree Teardown (after Gate 3 merge)

```bash
git worktree remove ../worktrees/claude-max-usage-analytics-<feature-slug>
git branch -d dev/<feature-slug>
```

### Port Management

Each session claims a unique port to avoid conflicts:

```bash
# Claim a port
echo '{"port": 8080, "session": "<session-id>", "feature": "<feature-slug>"}' > ./ports/<session-id>.json

# Release port after session ends
rm ./ports/<session-id>.json
```

Base port: `8080`. If occupied, increment by 1 until a free port is found.

---

## Versioning

<!-- Full policy: github.com/bh679/claude-templates/standards/versioning.md -->

Format: `V.MM.PPPP`
- Bump **PPPP** on every commit
- Bump **MM** on every merged feature (reset PPPP to 0000)
- Bump **V** only for breaking changes

Update `package.json` version field on every commit.

---

## Testing

<!-- Full procedure: github.com/bh679/claude-templates/standards/workflow.md#gate-2 -->

### API Testing

```bash
curl -s http://localhost:8080/api/<endpoint> | jq .
```

### UI Testing (Playwright MCP)

Use the installed Playwright MCP tools for Gate 2 UI verification:

1. Navigate to the feature: `mcp__plugin_playwright_playwright__browser_navigate`
2. Take screenshots: `mcp__plugin_playwright_playwright__browser_take_screenshot`
3. Capture accessibility snapshot: `mcp__plugin_playwright_playwright__browser_snapshot`
4. Analyse results visually and produce the Gate 2 report

Screenshot naming: `gate2-<feature-slug>-<YYYY-MM>.png` saved to `./test-results/`

### After Gate 3: Blog Context

After a successful Gate 3 merge, invoke the `trigger-blog` skill to automatically
capture and queue the feature context for the weekly blog agent.

---

## Documentation

After Gate 3 merge, update the relevant wiki:
- **Features** → https://github.com/bh679/Claude-Max-Usage-Analytics/wiki
- Follow the wiki CLAUDE.md for structure (breadcrumbs, feature template, etc.)

<!-- Wiki writing standards: github.com/bh679/claude-templates/standards/wiki-writing.md -->

---

## Key Rules Summary

- Always use plan mode for all three gates
- Never merge without Gate 3 approval
- Re-read CLAUDE.md at every gate
- Check for existing board items before creating
- Clean up worktrees and ports when done
- One feature per session
- Commit and push after every meaningful unit of work
