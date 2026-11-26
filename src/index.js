// Triage Buddy — Forge function handlers.
// Rovo actions call these directly; the issue panel calls them through the
// resolver below. All the real thinking lives in triage.js.
import { makeResolver } from '@forge/resolver';
import { buildSimilarJql, extractKeywords, issueText, triageIssue } from './triage.js';
import { getIssue as fetchIssue, searchIssues, updateIssue } from './jiraClient.js';

function requireIssueKey(payload) {
  const key = payload?.issueKey?.trim();
  if (!key) throw new Error('issueKey is required, for example PROJ-123.');
  return key;
}

function publicIssue(issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    summary: f.summary,
    status: f.status?.name,
    priority: f.priority?.name,
    labels: f.labels || [],
    assignee: f.assignee ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName } : null,
    reporter: f.reporter ? { displayName: f.reporter.displayName } : null,
    created: f.created,
    descriptionText: issueText(issue).slice(0, 500),
  };
}

export async function getIssue(payload) {
  const issue = await fetchIssue(requireIssueKey(payload));
  return publicIssue(issue);
}

export async function findSimilarIssues(payload) {
  const issueKey = requireIssueKey(payload);
  const maxResults = Math.min(Math.max(Number(payload.maxResults) || 5, 1), 10);
  const issue = await fetchIssue(issueKey);
  const keywords = extractKeywords(issueText(issue));
  const jql = buildSimilarJql(issue, keywords);
  const issues = await searchIssues(jql, maxResults);
  return {
    issueKey,
    keywords,
    jql,
    similar: issues.map(publicIssue),
  };
}

export async function suggestTriage(payload) {
  const issueKey = requireIssueKey(payload);
  const issue = await fetchIssue(issueKey);
  const keywords = extractKeywords(issueText(issue));
  const jql = buildSimilarJql(issue, keywords);
  const similar = await searchIssues(jql, 5);
  return triageIssue(issue, similar);
}

export async function applyTriage(payload) {
  const issueKey = requireIssueKey(payload);
  const labels = (payload.labels || '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  const updated = await updateIssue(issueKey, {
    priority: payload.priority?.trim() || undefined,
    labels,
    assigneeAccountId: payload.assigneeAccountId?.trim() || undefined,
  });
  return {
    issueKey,
    applied: {
      priority: updated.fields.priority?.name,
      labels: updated.fields.labels || [],
      assignee: updated.fields.assignee?.displayName || null,
    },
  };
}

// Issue panel resolver (UI Kit). The panel passes { issueKey }.
// makeResolver (not `new Resolver()`) so the module also loads under plain
// Node ESM, where the package's default export does not interop.
export const handler = makeResolver({
  getTriage: async ({ payload }) => {
    const issue = await fetchIssue(requireIssueKey(payload));
    const keywords = extractKeywords(issueText(issue));
    const jql = buildSimilarJql(issue, keywords);
    const similar = await searchIssues(jql, 5);
    return {
      issue: publicIssue(issue),
      suggestion: triageIssue(issue, similar),
      similar: similar.map(publicIssue),
    };
  },
  applyTriage: async ({ payload }) => applyTriage(payload),
});
