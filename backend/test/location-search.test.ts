import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import express from 'express';
import { locationSearchRouter } from '../src/location-search.js';

const realFetch = globalThis.fetch;

async function setup(t: TestContext) {
  const savedKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  t.after(() => {
    if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedKey;
  });
  const app = express();
  app.use(express.json());
  app.use(locationSearchRouter);
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return (query: string) => realFetch(`http://127.0.0.1:${address.port}/location/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

test('address search returns the selected destination coordinates, without a country restriction', async (t) => {
  const request = await setup(t);
  t.mock.method(globalThis, 'fetch', async (input: URL) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('address'), '24 Sussex Drive, Ottawa, Canada');
    assert.equal(url.searchParams.has('components'), false);
    assert.equal(url.searchParams.get('key'), 'test-key');
    return Response.json({
      status: 'OK',
      results: [{
        place_id: 'ottawa-address',
        formatted_address: '24 Sussex Drive, Ottawa, Canada',
        geometry: { location: { lat: 45.4439, lng: -75.6934 } },
      }],
    });
  });
  const response = await request('24 Sussex Drive, Ottawa, Canada');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    places: [{
      id: 'ottawa-address',
      label: '24 Sussex Drive, Ottawa, Canada',
      lat: 45.4439,
      lng: -75.6934,
      partial_match: false,
    }],
  });
});

test('empty map results cannot be mistaken for the current coordinates', async (t) => {
  const request = await setup(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'ZERO_RESULTS', results: [] }));
  const response = await request('An address that does not exist');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { places: [] });
});

test('short addresses are rejected before contacting the map service', async (t) => {
  const request = await setup(t);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not call map service'); });
  assert.equal((await request('ab')).status, 400);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('map failures and missing configuration are explicit and never return invented coordinates', async (t) => {
  const request = await setup(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'REQUEST_DENIED', results: [] }));
  const failed = await request('A valid address');
  assert.equal(failed.status, 503);
  assert.equal('places' in await failed.json(), false);
  delete process.env.GOOGLE_MAPS_API_KEY;
  const unconfigured = await request('A valid address');
  assert.equal(unconfigured.status, 503);
  assert.match((await unconfigured.json()).error, /not configured/);
});
