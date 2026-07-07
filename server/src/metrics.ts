/**
 * Prometheus metrics for the mobile backend, served at GET /metrics and
 * scraped by Fly managed Prometheus (fly.toml [metrics]). Fly's scraper adds
 * the `app` label, so no app label is set here.
 *
 * Label discipline: every label is BOUNDED — HTTP method, the Express route
 * pattern (never the raw URL), the status class ("2xx"/"4xx"/"5xx"), and
 * result ("ok"/"failed"). Never put user ids, wallet addresses, device
 * tokens, or transaction hashes in labels.
 */
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds by method, Express route pattern, and status class.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const mobileWalletOpenedTotal = new Counter({
  name: 'mobile_wallet_opened_total',
  help: 'Wallet sessions opened: one Coinbase custom sign-in token was issued so a signed-in user could open their wallet.',
  registers: [metricsRegistry],
});

export const mobileBuyTotal = new Counter({
  name: 'mobile_buy_total',
  help: 'Onramp buy settlements observed from verified Coinbase transaction webhooks.',
  labelNames: ['result'],
  registers: [metricsRegistry],
});

export const mobileCashOutTotal = new Counter({
  name: 'mobile_cash_out_total',
  help: 'Offramp cash-out settlements observed from verified Coinbase transaction webhooks.',
  labelNames: ['result'],
  registers: [metricsRegistry],
});

export const mobileSendTotal = new Counter({
  name: 'mobile_send_total',
  help: 'Wallet sends resolved against a verified Base chain receipt at the wallet-intent confirm endpoints.',
  labelNames: ['result'],
  registers: [metricsRegistry],
});

export const mobilePushRegistrationsTotal = new Counter({
  name: 'mobile_push_registrations_total',
  help: 'Push tokens registered and stored for signed-in users.',
  registers: [metricsRegistry],
});

/** "2xx" / "4xx" / "5xx": status classes keep the label set bounded. */
export function statusClass(statusCode: number) {
  return `${Math.floor(statusCode / 100)}xx`;
}

/**
 * Records one observation per finished response. The route label is the
 * matched Express route pattern (e.g. /mobile/regents/:id), never the raw
 * URL; requests that match no route are bucketed as "unmatched" so hostile
 * path scans cannot explode label cardinality.
 */
export function createHttpMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const endTimer = httpRequestDurationSeconds.startTimer();

    res.on('finish', () => {
      const routePath = req.route?.path;
      const route = typeof routePath === 'string' ? `${req.baseUrl || ''}${routePath}` : 'unmatched';

      endTimer({
        method: req.method,
        route,
        status_code: statusClass(res.statusCode),
      });
    });

    next();
  };
}

/**
 * Counts buy and cash-out settlements from the canonical webhook event type.
 * Called exactly once per event, after the webhook is verified, claimed, and
 * marked processed (the dedupe claim guarantees redeliveries do not recount).
 */
export function recordTransactionWebhookOutcome(eventType: string) {
  switch (eventType) {
    case 'onramp.transaction.success':
      mobileBuyTotal.inc({ result: 'ok' });
      break;
    case 'onramp.transaction.failed':
      mobileBuyTotal.inc({ result: 'failed' });
      break;
    case 'offramp.transaction.success':
      mobileCashOutTotal.inc({ result: 'ok' });
      break;
    case 'offramp.transaction.failed':
      mobileCashOutTotal.inc({ result: 'failed' });
      break;
  }
}

/** GET /metrics: Prometheus text exposition from the app registry. */
export async function metricsHandler(_req: Request, res: Response) {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
}

export function resetMetricsForTests() {
  metricsRegistry.resetMetrics();
}
