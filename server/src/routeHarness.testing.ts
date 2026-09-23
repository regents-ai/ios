import type { Request, Response, Router } from 'express';

import type { LocalEntries, LocalEntriesStore } from './mobileAgents.js';

/** Test-only helpers for driving a router without a network listener. */

export const AGENT_WALLET = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';

/** A SIWA-signed request's headers, each present once. */
export const PROOF_HEADERS = {
  signature: 'sig1=:abc:',
  'signature-input': 'sig1=("@method" "@path")',
  'content-digest': 'sha-256=:abc:',
  'x-siwa-receipt': 'receipt',
  'x-key-id': AGENT_WALLET,
  'x-timestamp': '1700000000',
  'x-agent-wallet-address': AGENT_WALLET,
  'x-agent-chain-id': '8453',
};

export type RouteCall = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  userId?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
};

export type RouteResult = { status: number; body: any };

export function memoryEntriesStore(): LocalEntriesStore & { state: LocalEntries } {
  const clone = (value: LocalEntries): LocalEntries => JSON.parse(JSON.stringify(value));
  const store = {
    state: { entries: {} } as LocalEntries,
    read: () => clone(store.state),
    update(mutator: (state: LocalEntries) => void) {
      const next = clone(store.state);
      mutator(next);
      store.state = next;
      return clone(next);
    },
  };
  return store;
}

/** Sends one request through the routers in order, the way Express would, and resolves with the JSON answer. */
export function routeRequester(...routers: Router[]) {
  const handlers = routers as unknown as {
    handle(request: Request, response: Response, next: (error?: unknown) => void): void;
  }[];

  return (call: RouteCall) =>
    new Promise<RouteResult>((resolve, reject) => {
      let statusCode = 200;
      const headers: Record<string, string> = {
        ...(call.method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(call.headers ?? {}),
      };
      const req = {
        method: call.method,
        url: call.url,
        originalUrl: call.url,
        path: call.url,
        headers,
        headersDistinct: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, [value]])),
        body: call.rawBody !== undefined ? Buffer.from(call.rawBody) : call.body,
        query: {},
        params: {},
        userId: call.userId,
        header() {
          return undefined;
        },
        get() {
          return undefined;
        },
      } as unknown as Request;
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          resolve({ status: statusCode, body: payload });
          return this;
        },
        setHeader() {
          return this;
        },
        req,
      } as unknown as Response;

      const run = (index: number) => {
        const handler = handlers[index];
        if (!handler) {
          reject(new Error(`unhandled ${call.method} ${call.url}`));
          return;
        }
        handler.handle(req, res, (error?: unknown) => (error ? reject(error) : run(index + 1)));
      };
      run(0);
    });
}
