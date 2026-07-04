import assert from 'node:assert/strict';
import test from 'node:test';

import { CorsOriginError, createErrorHandler } from './errorHandling.js';

type CapturedResponse = {
  statusCode: number | null;
  body: any;
  headers: Record<string, string>;
};

function fakeResponse(path = '/mobile/regents') {
  const captured: CapturedResponse = { statusCode: null, body: null, headers: {} };

  const res: any = {
    headersSent: false,
    req: {
      path,
      header: () => undefined,
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };

  return { res, captured };
}

test('CORS rejection returns a 403 error envelope, not an HTML error page', () => {
  const { res, captured } = fakeResponse();
  const handler = createErrorHandler();

  handler(new CorsOriginError(), {} as any, res, () => {
    assert.fail('next() must not be called when the envelope is sent');
  });

  assert.equal(captured.statusCode, 403);
  assert.equal(captured.body.error.code, 'Forbidden');
  assert.equal(captured.body.error.product, 'ios');
  assert.equal(captured.body.error.status, 403);
  assert.equal(typeof captured.body.error.request_id, 'string');
});

test('middleware 4xx errors keep their status but get a stable client message', () => {
  const { res, captured } = fakeResponse();
  const handler = createErrorHandler();

  const parseError = Object.assign(new Error('Unexpected token < in JSON at position 0'), {
    status: 400,
    type: 'entity.parse.failed',
  });

  handler(parseError, {} as any, res, () => {
    assert.fail('next() must not be called when the envelope is sent');
  });

  assert.equal(captured.statusCode, 400);
  assert.equal(captured.body.error.code, 'BadRequest');
  assert.equal(captured.body.error.message, 'The request could not be processed.');
  assert.ok(!JSON.stringify(captured.body).includes('Unexpected token'));
});

test('unknown errors become a 500 envelope without the internal message', () => {
  const { res, captured } = fakeResponse();
  const handler = createErrorHandler();

  handler(new Error('ECONNREFUSED redis://internal-host:6379'), {} as any, res, () => {
    assert.fail('next() must not be called when the envelope is sent');
  });

  assert.equal(captured.statusCode, 500);
  assert.equal(captured.body.error.code, 'InternalError');
  assert.ok(!JSON.stringify(captured.body).includes('ECONNREFUSED'));
});

test('errors after headers are sent are delegated to the default handler', () => {
  const { res } = fakeResponse();
  res.headersSent = true;
  const handler = createErrorHandler();

  let delegated: unknown = null;
  handler(new Error('late failure'), {} as any, res, (error: unknown) => {
    delegated = error;
  });

  assert.ok(delegated instanceof Error);
});
