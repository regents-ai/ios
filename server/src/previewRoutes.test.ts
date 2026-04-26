import assert from 'node:assert/strict';
import test from 'node:test';

import { getPreviewRegentManagerForUser } from './agentPreviews.js';
import { createPreviewRoutes } from './previewRoutes.js';
import { listPreviewTerminalSessions } from './terminalPreviews.js';

function listRoutePaths() {
  const router = createPreviewRoutes();

  return router.stack
    .map((layer) => layer.route?.path)
    .filter((path): path is string => typeof path === 'string');
}

test('preview Regent Manager route stays mounted and returns the current manager shape', () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile-preview/agents/:id/regent-manager'));

  const body = getPreviewRegentManagerForUser('seeded-user', 'atlas-capital');
  assert.ok(body);
  assert.equal(body.agentId, 'atlas-capital');
  assert.equal(body.dashboardUrl, 'https://hermes-workspace.fly.dev/atlas-capital');
  assert.equal(body.roster.some((member: { name: string }) => member.name === 'Regent Manager'), true);
});

test('preview terminal routes remain mounted through the extracted router', () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile-preview/terminal/sessions'));

  const sessions = listPreviewTerminalSessions('seeded-user');
  assert.ok(Array.isArray(sessions));
  assert.ok(sessions.length > 0);
});

test('preview Regent Manager data is returned as a fresh copy', () => {
  const first = getPreviewRegentManagerForUser('seeded-user', 'atlas-capital');
  assert.ok(first);
  const firstGoal = first.goals[0];
  assert.ok(firstGoal);

  firstGoal.title = 'Changed by test';

  const second = getPreviewRegentManagerForUser('seeded-user', 'atlas-capital');
  assert.ok(second);
  const secondGoal = second.goals[0];
  assert.ok(secondGoal);
  assert.notEqual(secondGoal.title, 'Changed by test');
});
