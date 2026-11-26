# Triage Buddy

A Rovo agent for Jira that does the boring first half of triage for you.

Open any issue and Triage Buddy tells you what priority it deserves, which
labels fit, who fixed this kind of thing before, and drafts the first reply
you can send to the reporter. You can chat with it in Rovo, or use the
“Triage Buddy” panel right on the issue. Nothing gets changed unless you
ask it to — applying a suggestion is always your call.

Built for **Codegeist 2026** (Atlassian / Devpost):

- **Category:** Apps for Software Teams
- **Bonus prize:** Best Agents — Rovo/Assignable agents (uses the
  `rovo:agent` module plus four reusable `action` modules)

## How it works

Two ways in, same brain:

1. **Rovo agent.** Chat with Triage Buddy in Rovo Chat. It reads the issue
   on screen, finds similar past issues, and explains its suggestion in
   plain words — including *why* (it names the similar issues it learned
   from). Conversation starters: “Triage the issue on screen”, “Who should
   own this issue?”, “Draft a first reply for this issue”.
2. **Issue panel.** A “Triage Buddy” panel on every Jira issue shows the
   suggestion (priority, labels, likely owner, draft reply, similar
   issues) with one **Apply this triage** button.

Under the hood, four Forge actions do the work:

| Action | What it does |
| --- | --- |
| `get-issue` | Reads one issue (summary, description, status, priority, labels, reporter, assignee). |
| `find-similar-issues` | Searches the same project for past issues matching the keywords in this one. |
| `suggest-triage` | Scores the priority from keyword signals and similar-issue history, picks labels, finds the person who resolved the most similar issues, and drafts a first reply. |
| `apply-triage` | Sets priority, adds labels, sets assignee — only when asked. |

The scoring is deterministic and boring on purpose: a crash or outage reads
Highest, a typo reads Low, everything else lands Medium unless similar
issues say otherwise. No external services, no data leaves Atlassian — every
call goes through the Jira REST API via `@forge/api`.

## Project layout

```
manifest.yml            Forge manifest (rovo:agent, 4 actions, jira:issuePanel)
package.json
src/
  index.js              Forge function handlers + issue-panel resolver
  triage.js             Pure triage logic (scoring, labels, owner, draft reply)
  jiraClient.js         Jira REST wrappers (get issue, search, update)
  frontend/index.jsx    Issue panel UI (UI Kit, @forge/react)
tests/
  triage.test.js        19 unit tests for the triage logic
```

## Setup

You need a free Atlassian account and the Forge CLI (16.x, Node 22+).

```bash
npm install -g @forge/cli
forge login --email speedcuat@gmail.com   # needs an Atlassian API token
```

Then, from this directory:

```bash
npm install
forge register        # replaces the placeholder app id in manifest.yml
forge deploy          # deploys to the development environment
forge install --site <your-site>.atlassian.net --product jira
```

To try the Rovo agent, your site needs Rovo turned on — that comes with a
Jira Standard or Premium plan, and a trial of either includes it. The issue
panel works on any Jira Cloud site, Rovo or not.

## Demo in 2 minutes

See `DEMO_SCRIPT.md` for the word-for-word walkthrough. Short version:
open a crash issue, open the Triage Buddy panel, read the suggestion, hit
Apply — then ask the agent in Rovo Chat “who should own this?” and “draft
a first reply”.

## Tests

```bash
npm test     # 19 tests, all passing — triage scoring, JQL, labels, owner, draft reply
```

`forge lint` and `forge deploy` need a Forge login (API token), so they
could not run in this sandbox — the manifest was validated by parsing it
and checking every referenced handler exists, and the triage logic is
covered by the unit tests above.

## Known limits

- The `app.id` in `manifest.yml` is a placeholder until `forge register`
  runs — the CLI replaces it with the real app ID.
- The Rovo agent part needs a Rovo-enabled site to chat with. The panel
  and the actions work anywhere Jira does.
- The agent only knows what Jira knows: if a project has no resolved
  history, it says so instead of inventing an owner.
