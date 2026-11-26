import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  SectionMessage,
  Stack,
  Strong,
  Text,
} from '@forge/react';
import { invoke, showFlag, view } from '@forge/bridge';

const App = () => {
  const [issueKey, setIssueKey] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const load = async () => {
    if (!issueKey) return;
    setState({ loading: true, error: null, data: null });
    setApplied(false);
    try {
      const data = await invoke('getTriage', { issueKey });
      setState({ loading: false, error: null, data });
    } catch (err) {
      setState({ loading: false, error: String(err?.message || err), data: null });
    }
  };

  useEffect(() => {
    view
      .getContext()
      .then((ctx) => setIssueKey(ctx?.extension?.issue?.key || null))
      .catch(() => setIssueKey(null));
  }, []);

  useEffect(() => {
    load();
  }, [issueKey]);

  const apply = async () => {
    const suggestion = state.data?.suggestion;
    if (!suggestion) return;
    setApplying(true);
    try {
      await invoke('applyTriage', {
        issueKey,
        priority: suggestion.priority,
        labels: suggestion.labels.join(','),
        assigneeAccountId: suggestion.assignee?.accountId || '',
      });
      setApplied(true);
      showFlag({
        type: 'success',
        title: 'Triage applied',
        description: `${issueKey} is now ${suggestion.priority} priority.`,
      });
      load();
    } catch (err) {
      showFlag({
        type: 'error',
        title: 'Could not apply triage',
        description: String(err?.message || err),
      });
    } finally {
      setApplying(false);
    }
  };

  if (!issueKey) {
    return <Text>Open this panel on a Jira issue to see its triage.</Text>;
  }

  if (state.loading) {
    return <Text>Working out the triage for {issueKey}…</Text>;
  }

  if (state.error) {
    return (
      <Stack space="space.200">
        <SectionMessage title="Triage Buddy hit a snag" appearance="warning">
          <Text>{state.error}</Text>
        </SectionMessage>
        <Button onClick={load}>Try again</Button>
      </Stack>
    );
  }

  const { issue, suggestion, similar } = state.data;
  return (
    <Stack space="space.200">
      <Heading size="medium">
        {issue.key} — {suggestion.priority} priority
      </Heading>
      <Text>
        {suggestion.confidence === 'high'
          ? 'Pretty confident about this one.'
          : suggestion.confidence === 'medium'
            ? 'A reasonable guess — check it before applying.'
            : 'Not much to go on here — take this one with a pinch of salt.'}
      </Text>
      <Box>
        <Text>
          <Strong>Why:</Strong> {suggestion.reasons.join('. ')}.
        </Text>
      </Box>
      <Box>
        <Text>
          <Strong>Suggested labels:</Strong>{' '}
          {suggestion.labels.length ? suggestion.labels.join(', ') : 'none'}
        </Text>
      </Box>
      <Box>
        <Text>
          <Strong>Likely owner:</Strong>{' '}
          {suggestion.assignee
            ? `${suggestion.assignee.displayName} (fixed ${suggestion.assignee.count} similar before)`
            : 'nobody obvious yet'}
        </Text>
      </Box>
      <Box>
        <Text>
          <Strong>Draft first reply:</Strong>
        </Text>
        <Text>{suggestion.draftReply}</Text>
      </Box>
      {similar.length > 0 && (
        <Box>
          <Text>
            <Strong>Similar issues ({similar.length}):</Strong>{' '}
            {similar.map((s) => `${s.key} (${s.status})`).join(', ')}
          </Text>
        </Box>
      )}
      {applied && (
        <SectionMessage title="Done" appearance="confirmation">
          <Text>Triage applied to {issueKey}.</Text>
        </SectionMessage>
      )}
      <Button onClick={apply} isDisabled={applying}>
        {applying ? 'Applying…' : 'Apply this triage'}
      </Button>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
