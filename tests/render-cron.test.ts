import test from 'node:test';
import assert from 'node:assert/strict';
import { configureRenderCron, cronConfiguration } from '../scripts/setup-render-cron.mjs';

test('cron setup targets only the provider, reuses the exact job and does not log account secrets', async () => {
  let saved: any,
    puts = 0,
    patches = 0;
  const request = async (url: string, init: RequestInit) => {
    assert.ok(url.startsWith('https://api.cron-job.org/jobs'));
    assert.equal(init.redirect, 'error');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fixture-key');
    if (url.endsWith('/history'))
      return Response.json({
        history: [
          {
            date: 1793779200,
            status: 1,
            httpStatus: 200,
            body: 'PRIVATE fixture content',
            headers: 'PRIVATE',
          },
        ],
      });
    if (init.method === 'GET' && url.endsWith('/jobs'))
      return Response.json({ jobs: saved ? [{ ...saved, jobId: 42 }] : [], someFailed: false });
    if (init.method === 'PUT') {
      puts++;
      saved = JSON.parse(String(init.body)).job;
      return Response.json({ jobId: 42 });
    }
    if (init.method === 'PATCH') {
      patches++;
      saved = JSON.parse(String(init.body)).job;
      return Response.json({});
    }
    return Response.json({ jobDetails: { ...saved, auth: { password: 'PRIVATE' } } });
  };
  const first = await configureRenderCron({ key: 'fixture-key', request });
  assert.equal(first.enabled, true);
  await configureRenderCron({ key: 'fixture-key', request });
  assert.equal(puts, 1);
  assert.equal(patches, 1);
  const summary = await configureRenderCron({ key: 'fixture-key', request, statusOnly: true });
  assert.ok(!JSON.stringify(summary).includes('PRIVATE'));
  assert.equal(summary.executions[0].success, true);
  assert.deepEqual(
    saved.schedule.minutes,
    Array.from({ length: 12 }, (_, i) => i * 5),
  );
});

test('cron setup fails closed on partial lists, collisions, redirects and uncertain creates without retry', async () => {
  for (const listed of [
    { jobs: [], someFailed: true },
    {
      jobs: [
        { ...cronConfiguration().job, jobId: 42 },
        { ...cronConfiguration().job, jobId: 43 },
      ],
      someFailed: false,
    },
    {
      jobs: [{ ...cronConfiguration().job, url: 'https://unrelated.test/', jobId: 42 }],
      someFailed: false,
    },
  ]) {
    let calls = 0;
    await assert.rejects(
      configureRenderCron({
        key: 'fixture',
        request: async () => {
          calls++;
          return Response.json(listed);
        },
      }),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    configureRenderCron({
      key: 'fixture',
      request: async () => {
        if (++calls === 1) return Response.json({ jobs: [], someFailed: false });
        throw Error('Ambiguous response with PRIVATE token');
      },
    }),
    (e: Error) => !e.message.includes('PRIVATE') && e.message.includes('Không tự retry'),
  );
  assert.equal(calls, 2);
  await assert.rejects(
    configureRenderCron({ key: 'fixture', request: async () => new Response('', { status: 302 }) }),
    /HTTP 302/,
  );
});
