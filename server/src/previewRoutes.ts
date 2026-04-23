import { Router } from 'express';
import { z } from 'zod';

import {
  createPreviewWithdrawalForUser,
  getPreviewAgentForUser,
  getPreviewRegentManagerForUser,
  getPreviewWithdrawalForUser,
  listPreviewAgentsForUser,
  seedReviewPreviewAgents,
} from './agentPreviews.js';
import {
  createPreviewTerminalSession,
  getPreviewTerminalEvents,
  getPreviewTerminalSession,
  listPreviewTerminalSessions,
  postPreviewTerminalMessage,
  resolvePreviewTerminalApproval,
  seedReviewPreviewTerminalSessions,
} from './terminalPreviews.js';

const currentUserId = (userId?: string) => userId || 'seeded-user';

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const withdrawalParamsSchema = z.object({
  id: z.string().min(1),
  withdrawalId: z.string().min(1),
});

const terminalSessionParamsSchema = z.object({
  id: z.string().min(1),
});

const terminalApprovalParamsSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
});

export function createPreviewRoutes() {
  seedReviewPreviewAgents();
  seedReviewPreviewTerminalSessions();

  const router = Router();

  router.get('/mobile-preview/agents', (req, res) => {
    res.json({
      agents: listPreviewAgentsForUser(currentUserId(req.userId)),
    });
  });

  router.get('/mobile-preview/agents/:id', (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid agent ID is required.',
      });
    }

    const agent = getPreviewAgentForUser(currentUserId(req.userId), parsed.data.id);
    if (!agent) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That agent could not be found.',
      });
    }

    return res.json(agent);
  });

  router.get('/mobile-preview/agents/:id/regent-manager', (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid agent ID is required.',
      });
    }

    const regentManager = getPreviewRegentManagerForUser(currentUserId(req.userId), parsed.data.id);
    if (!regentManager) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That Regent Manager view could not be found.',
      });
    }

    return res.json(regentManager);
  });

  router.post('/mobile-preview/agents/:id/withdrawals', (req, res) => {
    const bodySchema = z.object({
      amount: z.string().min(1),
      currency: z.string().min(1),
      destinationWalletAddress: z.string().min(1),
    });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();

    const parsedParams = agentIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid agent ID is required.',
      });
    }

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Amount, currency, and destination wallet address are required.',
      });
    }

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'An idempotency key is required for withdrawal requests.',
      });
    }

    const withdrawal = createPreviewWithdrawalForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey
    );
    if (!withdrawal) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That agent could not be found.',
      });
    }

    return res.status(201).json({ withdrawal });
  });

  router.get('/mobile-preview/agents/:id/withdrawals/:withdrawalId', (req, res) => {
    const parsed = withdrawalParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid agent ID and withdrawal ID are required.',
      });
    }

    const withdrawal = getPreviewWithdrawalForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.withdrawalId
    );
    if (!withdrawal) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That withdrawal request could not be found.',
      });
    }

    return res.json({ withdrawal });
  });

  router.get('/mobile-preview/terminal/sessions', (req, res) => {
    res.json({
      sessions: listPreviewTerminalSessions(currentUserId(req.userId)),
    });
  });

  router.post('/mobile-preview/terminal/sessions', (req, res) => {
    const bodySchema = z.object({
      agentId: z.string().min(1),
      agentName: z.string().min(1),
    });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'An agent ID and agent name are required.',
      });
    }

    const session = createPreviewTerminalSession(currentUserId(req.userId), parsedBody.data);
    return res.status(201).json({ session });
  });

  router.get('/mobile-preview/terminal/sessions/:id', (req, res) => {
    const parsed = terminalSessionParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid session ID is required.',
      });
    }

    const session = getPreviewTerminalSession(currentUserId(req.userId), parsed.data.id);
    if (!session) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That session could not be found.',
      });
    }

    return res.json({ session });
  });

  router.get('/mobile-preview/terminal/sessions/:id/events', (req, res) => {
    const parsed = terminalSessionParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid session ID is required.',
      });
    }

    const events = getPreviewTerminalEvents(currentUserId(req.userId), parsed.data.id);
    if (!events) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That session could not be found.',
      });
    }

    return res.json({ events });
  });

  router.post('/mobile-preview/terminal/sessions/:id/messages', (req, res) => {
    const bodySchema = z.object({
      text: z.string().min(1),
    });
    const parsedParams = terminalSessionParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid session ID and message are required.',
      });
    }

    const session = postPreviewTerminalMessage(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data.text
    );
    if (!session) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That session could not be found.',
      });
    }

    return res.status(202).json({ session });
  });

  router.post('/mobile-preview/terminal/sessions/:id/approvals/:requestId', (req, res) => {
    const bodySchema = z.object({
      decision: z.enum(['approved', 'denied']),
    });
    const parsedParams = terminalApprovalParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'A valid session ID, request ID, and decision are required.',
      });
    }

    const session = resolvePreviewTerminalApproval(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.requestId,
      parsedBody.data.decision
    );
    if (!session) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'That approval request could not be found.',
      });
    }

    return res.json({ session });
  });

  return router;
}
