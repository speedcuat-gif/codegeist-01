# NOTICE

Triage Buddy was written from scratch for Codegeist 2026. No starter
template was used — `forge create` needs a Forge login, which was not
available in this sandbox, so the app was scaffolded by hand.

Reference material consulted (docs only, no code copied):

- Forge manifest reference — https://developer.atlassian.com/platform/forge/manifest-reference/
- Rovo Agent module reference — https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/
- “Build a Rovo Agent hello world app” tutorial — https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-agent/
- Jira issue panel module reference — https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/
- Codegeist 2026 official rules — https://codegeist2026.devpost.com/rules

All application code (manifest, resolvers, triage scoring, UI) is original
work. Third-party packages are the standard Forge libraries
(`@forge/api`, `@forge/react`, `@forge/resolver`, `@forge/bridge`) under
their own licenses, listed in package.json.
