import * as assert from 'node:assert/strict';
import { api } from './api';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function run() {
  const originalFetch = globalThis.fetch;
  try {
    const requests: URL[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input), 'http://dataflow.test');
      requests.push(requestUrl);
      const cursor = requestUrl.searchParams.get('cursor');
      if (!cursor) return jsonResponse({ rows: [{ id: 'p1' }, { id: 'p2' }], nextCursor: 'cursor-1' });
      if (cursor === 'cursor-1') return jsonResponse({ rows: [{ id: 'p3' }], nextCursor: null });
      throw new Error(`Unexpected cursor ${cursor}`);
    }) as typeof fetch;

    const rows = await api.listAllPipelines({ stage: 'testing' }, 500);
    assert.deepEqual(rows.map(row => row.id), ['p1', 'p2', 'p3']);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(url => url.searchParams.get('limit')), ['200', '200']);
    assert.deepEqual(requests.map(url => url.searchParams.get('stage')), ['testing', 'testing']);
    assert.deepEqual(requests.map(url => url.searchParams.get('cursor')), [null, 'cursor-1']);

    let repeatedCursorCalls = 0;
    globalThis.fetch = (async () => {
      repeatedCursorCalls++;
      return jsonResponse({ rows: [], nextCursor: 'repeated' });
    }) as typeof fetch;
    await assert.rejects(api.listAllPipelines(), /repeated cursor/);
    assert.equal(repeatedCursorCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run()
  .then(() => console.log('api.test.ts OK'))
  .catch(error => { console.error(error); process.exitCode = 1; });
