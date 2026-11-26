// Thin wrappers around the Jira Cloud REST API, called as the app
// (asApp). Kept separate from index.js so the handlers stay small.
import { asApp, route } from '@forge/api';

async function requestJson(routeObj, options = {}) {
  const res = await asApp().requestJira(routeObj, {
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jira API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function getIssue(issueKey) {
  // Keep the path static in the route template — passing a fully-built
  // string through `route` trips Forge's path-manipulation check.
  return requestJson(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,status,priority,labels,assignee,reporter,created,project,issuetype,components,resolution`,
  );
}

export async function searchIssues(jql, maxResults = 5) {
  const data = await requestJson(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql,
      maxResults,
      fields: ['summary', 'status', 'priority', 'labels', 'assignee', 'resolution'],
    }),
  });
  return data.issues || [];
}

export async function updateIssue(issueKey, { priority, labels, assigneeAccountId }) {
  const fields = {};
  if (priority) fields.priority = { name: priority };
  if (labels && labels.length) {
    const current = await getIssue(issueKey);
    const merged = [...new Set([...(current.fields.labels || []), ...labels])];
    fields.labels = merged;
  }
  if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
  if (!Object.keys(fields).length) {
    throw new Error('Nothing to apply — no priority, labels or assignee given.');
  }
  await requestJson(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return getIssue(issueKey);
}
