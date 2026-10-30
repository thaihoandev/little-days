import test from 'node:test';
import assert from 'node:assert/strict';
import { errorDiagnostics } from '../apps/api/src/observability.js';
test('unexpected-error diagnostics retain safe codes/status while excluding private error details', () => {
  const error = new TypeError('private-secret/photo.jpg', {
    cause: {
      code: 'ECONNRESET',
      http_code: 503,
      message: 'secret API key',
      response: 'private data',
    },
  });
  assert.deepEqual(errorDiagnostics(error), {
    errorType: 'TypeError',
    errorCode: 'ECONNRESET',
    upstreamStatus: 503,
  });
  assert.deepEqual(
    errorDiagnostics({
      name: 'private-user@example.test',
      code: 'private-password',
      http_code: 999,
      path: '/private-photo',
    }),
    { errorType: 'Error' },
  );
  assert.deepEqual(errorDiagnostics(null), { errorType: 'Error' });
  assert.deepEqual(errorDiagnostics(new Error('sensitive text')), { errorType: 'Error' });
});
