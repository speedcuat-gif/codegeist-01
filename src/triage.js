// Triage Buddy — pure triage logic.
// No Atlassian imports here on purpose, so every function in this file is
// unit-testable with plain node. The Forge functions in index.js are thin
// wrappers around these helpers plus the Jira API client.

export const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'had',
  'when', 'what', 'where', 'which', 'there', 'here', 'about', 'into', 'over',
  'after', 'before', 'then', 'than', 'also', 'just', 'like', 'more', 'most',
  'some', 'such', 'only', 'very', 'will', 'would', 'could', 'should', 'been',
  'being', 'does', 'did', 'are', 'was', 'were', 'not', 'but', 'our', 'your',
  'his', 'her', 'its', 'they', 'them', 'their', 'can', 'cannot', 'get', 'got',
  'please', 'thanks', 'issue', 'problem', 'error', 'using', 'user', 'users',
]);

// Words that push the priority up, in order. The first matching band wins.
export const PRIORITY_SIGNALS = [
  {
    priority: 'Highest',
    keywords: [
      'crash', 'outage', 'down', 'unavailable', 'data loss', 'dataloss',
      'breach', 'security', 'payment failed', 'payments down', 'corrupt',
      'deleted', 'production down', 'prod down', 'cannot login', "can't login",
    ],
    reason: 'reads like a production-down or data/security problem',
  },
  {
    priority: 'High',
    keywords: [
      'blocker', 'blocked', 'broken', 'fails', 'failure', 'regression',
      'leak', 'timeout', 'slow', 'missing', '500',
      'exception', 'blank', 'freeze', 'hang',
    ],
    reason: 'reads like something broken that blocks real work',
  },
  {
    priority: 'Low',
    keywords: [
      'typo', 'docs', 'documentation', 'wording', 'copy', 'cosmetic',
      'polish', 'nit', 'suggestion', 'nice to have', 'enhancement',
    ],
    reason: 'reads like a cosmetic or docs-only fix',
  },
];

// Map a keyword found in the issue to a label the team would actually use.
export const KEYWORD_LABELS = {
  crash: 'crash',
  login: 'auth',
  auth: 'auth',
  password: 'auth',
  payment: 'payments',
  checkout: 'payments',
  billing: 'payments',
  invoice: 'payments',
  mobile: 'mobile',
  android: 'mobile',
  ios: 'mobile',
  slow: 'performance',
  performance: 'performance',
  timeout: 'performance',
  memory: 'performance',
  search: 'search',
  email: 'notifications',
  notification: 'notifications',
  export: 'export',
  import: 'import',
  api: 'api',
  ui: 'ui',
  dashboard: 'ui',
};

// Turn an Atlassian Document Format (ADF) description into plain text.
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(adfToText).filter(Boolean).join(' ');
  }
  return '';
}

// Plain text of an issue for keyword matching.
export function issueText(issue) {
  const parts = [issue?.fields?.summary || '', adfToText(issue?.fields?.description)];
  return parts.filter(Boolean).join(' ');
}

// Most frequent meaningful words in the text, best first.
export function extractKeywords(text, maxKeywords = 8) {
  const counts = new Map();
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    const word = raw.trim();
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function escapeJql(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// JQL that finds issues in the same project whose summary or description
// mentions the same keywords. Never matches the issue itself.
export function buildSimilarJql(issue, keywords) {
  const projectKey = issue?.fields?.project?.key || issue?.key?.split('-')[0] || '';
  const terms = (keywords || []).slice(0, 4);
  const clauses = terms.flatMap((kw) => [
    `summary ~ "${escapeJql(kw)}"`,
    `description ~ "${escapeJql(kw)}"`,
  ]);
  const where = clauses.length ? ` AND (${clauses.join(' OR ')})` : '';
  return `project = ${projectKey} AND key != ${issue.key}${where} ORDER BY created DESC`;
}

// Score the priority from the issue text. Returns { priority, reason }.
export function scorePriority(issue, similar = []) {
  const text = issueText(issue).toLowerCase();
  for (const signal of PRIORITY_SIGNALS) {
    const hit = signal.keywords.find((kw) => text.includes(kw));
    if (hit) {
      return {
        priority: signal.priority,
        reason: `matched "${hit}" — ${signal.reason}`,
      };
    }
  }
  // No keyword hit: if very similar issues were mostly high priority, follow them.
  const highSimilar = (similar || []).filter((s) =>
    ['Highest', 'High'].includes(s?.fields?.priority?.name),
  ).length;
  if (similar && similar.length >= 2 && highSimilar >= Math.ceil(similar.length / 2)) {
    return {
      priority: 'High',
      reason: `${highSimilar} of ${similar.length} similar issues were High or Highest priority`,
    };
  }
  return { priority: 'Medium', reason: 'no strong signal — looks like normal work' };
}

// Labels from keywords, plus the most common labels on similar issues.
export function suggestLabels(issue, similar = []) {
  const labels = new Set();
  const text = issueText(issue).toLowerCase();
  for (const [keyword, label] of Object.entries(KEYWORD_LABELS)) {
    if (text.includes(keyword)) labels.add(label);
  }
  const labelCounts = new Map();
  for (const s of similar || []) {
    for (const label of s?.fields?.labels || []) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }
  }
  for (const [label] of [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    labels.add(label);
  }
  return [...labels].slice(0, 4);
}

// Who fixed this kind of thing before? Most frequent assignee of similar
// issues that got resolved. Returns null when there is no evidence.
export function suggestAssignee(similar = []) {
  const counts = new Map();
  for (const s of similar || []) {
    const assignee = s?.fields?.assignee;
    const resolved = s?.fields?.status?.statusCategory?.key === 'done' || !!s?.fields?.resolution;
    if (assignee?.accountId && resolved) {
      const key = assignee.accountId;
      const entry = counts.get(key) || { accountId: key, displayName: assignee.displayName, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best || null;
}

// Short, casual first reply a human can send as-is or tweak.
export function draftReply(issue, suggestion) {
  const summary = issue?.fields?.summary || 'this issue';
  const owner = suggestion.assignee?.displayName;
  const lines = [
    `Hey, thanks for flagging "${summary}".`,
    `We've got it triaged as ${suggestion.priority} priority${owner ? ` and ${owner} is the best person to pick it up` : ''} — they've handled the closest matches before.`,
    'We will post an update here once there is news.',
  ];
  return lines.join(' ');
}

// The whole triage in one call. `issue` is a Jira issue object, `similar`
// is the array returned by the similar-issues search.
export function triageIssue(issue, similar = []) {
  const { priority, reason } = scorePriority(issue, similar);
  const labels = suggestLabels(issue, similar);
  const assignee = suggestAssignee(similar);
  const suggestion = { priority, labels, assignee };
  const reasons = [reason];
  if (assignee) {
    reasons.push(`${assignee.displayName} resolved ${assignee.count} similar issue${assignee.count > 1 ? 's' : ''} before`);
  } else {
    reasons.push('no similar resolved issue points to an owner yet');
  }
  if (similar.length) reasons.push(`${similar.length} similar issue${similar.length > 1 ? 's' : ''} found`);
  const strongSignal = priority !== 'Medium' || similar.length >= 2;
  const confidence = strongSignal ? (similar.length ? 'high' : 'medium') : 'low';
  return {
    issueKey: issue.key,
    priority,
    labels,
    assignee,
    reasons,
    draftReply: draftReply(issue, suggestion),
    confidence,
    similarCount: similar.length,
  };
}
