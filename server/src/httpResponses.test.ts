import test from 'node:test';
import assert from 'node:assert/strict';

import { errorEnvelope } from './httpResponses.js';

test('errorEnvelope returns the mobile product error shape', () => {
  assert.deepEqual(
    errorEnvelope(400, '/mobile/regents', 'req_mobile_test', 'BadRequest', 'Choose a Regent first.'),
    {
      error: {
        code: 'BadRequest',
        product: 'ios',
        status: 400,
        path: '/mobile/regents',
        request_id: 'req_mobile_test',
        message: 'Choose a Regent first.',
        next_steps: null,
      },
    }
  );
});
