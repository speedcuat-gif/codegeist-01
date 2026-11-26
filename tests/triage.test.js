// Unit tests for the pure triage logic (src/triage.js).
// Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adfToText,
  buildSimilarJql,
  draftReply,
  extractKeywords,
  issueText,
  scorePriority,
  suggestAssignee,
  suggestLabels,
  triageIssue,
} from '../src/triage.js';

const crashIssue = {
  key: 'PROJ-101',
  fields: {
    summary: 'App crashes on login',
    description: {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'The mobile app crashes every time a user tries to login.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Started after the last release. Payment page is fine.' }] },
      ],
    },
    project: { key: 'PROJ' },
    status: { name: 'To Do' },
    priority: { name: 'Medium' },
    labels: [],
  },
};

const typoIssue = {
  key: 'PROJ-102',
  fields: {
    summary: 'Typo in the docs footer',
    description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The word "recieve" is spelled wrong in the documentation footer.' }] }] },
    project: { key: 'PROJ' },
    status: { name: 'To Do' },
    priority: { name: 'Medium' },
    labels: [],
  },
};

const similar = [
  {
    key: 'PROJ-88',
    fields: {
      summary: 'Login crash on Android',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      priority: { name: 'Highest' },
      labels: ['crash', 'auth'],
      assignee: { accountId: 'aaa-1', displayName: 'Ana' },
      resolution: { name: 'Done' },
    },
  },
  {
    key: 'PROJ-77',
    fields: {
      summary: 'Crash when opening the app',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      priority: { name: 'High' },
      labels: ['crash'],
      assignee: { accountId: 'aaa-1', displayName: 'Ana' },
      resolution: { name: 'Done' },
    },
  },
  {
    key: 'PROJ-66',
    fields: {
      summary: 'Login button does nothing',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      priority: { name: 'Medium' },
      labels: ['auth'],
      assignee: { accountId: 'bbb-2', displayName: 'Ben' },
      resolution: null,
    },
  },
];

describe('adfToText', () => {
  it('flattens nested ADF paragraphs to text', () => {
    assert.equal(adfToText(crashIssue.fields.description), 'The mobile app crashes every time a user tries to login. Started after the last release. Payment page is fine.');
  });
  it('handles plain strings and missing input', () => {
    assert.equal(adfToText('hello'), 'hello');
    assert.equal(adfToText(null), '');
    assert.equal(adfToText(undefined), '');
  });
});

describe('issueText', () => {
  it('joins summary and description', () => {
    assert.match(issueText(crashIssue), /App crashes on login/);
    assert.match(issueText(crashIssue), /mobile app crashes/);
  });
});

describe('extractKeywords', () => {
  it('drops stopwords and short words, orders by frequency', () => {
    const words = extractKeywords('crash crash login the app crashes on login');
    assert.equal(words[0], 'crash');
    assert.ok(words.includes('login'));
    assert.ok(!words.includes('the'));
    assert.ok(!words.includes('on'));
  });
  it('returns at most the requested count', () => {
    const words = extractKeywords('alpha beta gamma delta epsilon zeta eta theta', 3);
    assert.equal(words.length, 3);
  });
});

describe('buildSimilarJql', () => {
  it('scopes to the project, excludes the issue itself, orders by created', () => {
    const jql = buildSimilarJql(crashIssue, ['crash', 'login']);
    assert.match(jql, /project = PROJ/);
    assert.match(jql, /key != PROJ-101/);
    assert.match(jql, /summary ~ "crash"/);
    assert.match(jql, /description ~ "login"/);
    assert.match(jql, /ORDER BY created DESC/);
  });
  it('escapes quotes in keywords', () => {
    const jql = buildSimilarJql(crashIssue, ['say "hi"']);
    assert.match(jql, /say \\"hi\\"/);
  });
});

describe('scorePriority', () => {
  it('crash on login scores Highest', () => {
    const { priority } = scorePriority(crashIssue, similar);
    assert.equal(priority, 'Highest');
  });
  it('a typo scores Low', () => {
    const { priority } = scorePriority(typoIssue, []);
    assert.equal(priority, 'Low');
  });
  it('a plain issue with no signal scores Medium', () => {
    const plain = { key: 'PROJ-103', fields: { summary: 'Add a filter to the report list', description: null, project: { key: 'PROJ' } } };
    assert.equal(scorePriority(plain, []).priority, 'Medium');
  });
  it('follows similar issues when there is no keyword signal', () => {
    const plain = { key: 'PROJ-103', fields: { summary: 'Add a filter to the report list', description: null, project: { key: 'PROJ' } } };
    assert.equal(scorePriority(plain, similar).priority, 'High');
  });
});

describe('suggestLabels', () => {
  it('maps keywords to team labels and adds frequent similar labels', () => {
    const labels = suggestLabels(crashIssue, similar);
    assert.ok(labels.includes('crash'));
    assert.ok(labels.includes('auth'));
    assert.ok(labels.length <= 4);
  });
  it('returns an empty list when nothing matches', () => {
    const plain = { key: 'PROJ-103', fields: { summary: 'Quarterly planning', description: null, project: { key: 'PROJ' } } };
    assert.deepEqual(suggestLabels(plain, []), []);
  });
});

describe('suggestAssignee', () => {
  it('picks the person who resolved the most similar issues', () => {
    const assignee = suggestAssignee(similar);
    assert.equal(assignee.displayName, 'Ana');
    assert.equal(assignee.count, 2);
  });
  it('returns null when no similar issue was resolved by anyone', () => {
    const open = similar.map((s) => ({ ...s, fields: { ...s.fields, status: { name: 'Open', statusCategory: { key: 'new' } }, resolution: null } }));
    assert.equal(suggestAssignee(open), null);
    assert.equal(suggestAssignee([]), null);
  });
});

describe('draftReply', () => {
  it('mentions the summary, the priority and the owner', () => {
    const reply = draftReply(crashIssue, { priority: 'Highest', assignee: { displayName: 'Ana' } });
    assert.match(reply, /App crashes on login/);
    assert.match(reply, /Highest/);
    assert.match(reply, /Ana/);
  });
  it('works without an owner', () => {
    const reply = draftReply(crashIssue, { priority: 'Medium', assignee: null });
    assert.match(reply, /Medium/);
    assert.doesNotMatch(reply, /undefined/);
  });
});

describe('triageIssue', () => {
  it('triages a crash end to end', () => {
    const result = triageIssue(crashIssue, similar);
    assert.equal(result.issueKey, 'PROJ-101');
    assert.equal(result.priority, 'Highest');
    assert.ok(result.labels.includes('crash'));
    assert.equal(result.assignee.displayName, 'Ana');
    assert.equal(result.confidence, 'high');
    assert.equal(result.similarCount, 3);
    assert.ok(result.reasons.length >= 2);
    assert.match(result.draftReply, /Highest/);
  });
  it('is honest when there is nothing to go on', () => {
    const plain = { key: 'PROJ-103', fields: { summary: 'Quarterly planning', description: null, project: { key: 'PROJ' } } };
    const result = triageIssue(plain, []);
    assert.equal(result.priority, 'Medium');
    assert.equal(result.assignee, null);
    assert.equal(result.confidence, 'low');
  });
});
