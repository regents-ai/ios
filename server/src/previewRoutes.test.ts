import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import express from 'express';

import { getPreviewRegentManagerForUser } from './agentPreviews.js';
import { createPreviewRoutes } from './previewRoutes.js';

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use(createPreviewRoutes());

  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const request = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${(address as AddressInfo).port}${path}`, init);

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

  return { request, close };
}

test('preview Regent Manager route returns the current manager shape', async () => {
  const server = createTestServer();

  try {
    const response = await server.request('/mobile-preview/agents/atlas-capital/regent-manager');
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.agentId, 'atlas-capital');
    assert.equal(body.dashboardUrl, 'https://hermes-workspace.fly.dev/atlas-capital');
    assert.equal(body.roster.some((member: { name: string }) => member.name === 'Regent Manager'), true);
  } finally {
    await server.close();
  }
});

test('preview terminal routes remain mounted through the extracted router', async () => {
  const server = createTestServer();

  try {
    const response = await server.request('/mobile-preview/terminal/sessions');
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.ok(Array.isArray(body.sessions));
    assert.ok(body.sessions.length > 0);
  } finally {
    await server.close();
  }
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
