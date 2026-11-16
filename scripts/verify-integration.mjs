import assert from 'node:assert/strict';

const apiUrl = process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL;
const webOrigin = process.env.TEAM_WEB_ORIGIN;

if (!apiUrl || !webOrigin) {
  console.error('Set PUBLIC_API_URL (or NEXT_PUBLIC_API_URL) and TEAM_WEB_ORIGIN before checking integration.');
  process.exitCode = 1;
} else {
  try {
    const api = new URL(apiUrl);
    const website = new URL(webOrigin);
    for (const url of [api, website]) {
      assert.ok(['http:', 'https:'].includes(url.protocol), 'Use an HTTP or HTTPS URL.');
      assert.ok(!url.username && !url.password && !url.search && !url.hash, 'URLs must not contain credentials, queries or fragments.');
    }
    assert.equal(website.pathname, '/', 'TEAM_WEB_ORIGIN must be a website origin without a path.');

    async function readApi(path) {
      const response = await fetch(`${api.href.replace(/\/+$/, '')}${path}`, {
        headers: { Origin: website.origin },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, `${path} must return HTTP 200.`);
      assert.equal(response.headers.get('access-control-allow-origin'), website.origin, `${path} must allow the website's exact origin.`);
      return response.json();
    }

    const health = await readApi('/health');
    assert.equal(health.ok, true, 'API health must report success.');
    assert.equal(health.database, 'connected', 'The API must be connected to Supabase.');
    console.log('PASS: API and Supabase readiness');

    const catalog = await readApi('/products?size=1');
    assert.ok(Array.isArray(catalog.items), 'Catalog items must be an array.');
    assert.ok(catalog.items.length <= 1, 'The catalog must respect the requested page size.');
    assert.equal(typeof catalog.hasMore, 'boolean', 'The catalog must return its pagination state.');
    for (const product of catalog.items) {
      assert.equal(typeof product.id, 'string', 'Catalog products must have an ID.');
      assert.equal(typeof product.retail_price, 'number', 'Catalog products must have a retail price.');
      assert.equal(product.bulk_price, null, 'Public catalog responses must not expose protected bulk prices.');
      assert.equal(product.mega_bulk_price, null, 'Public catalog responses must not expose protected mega-bulk prices.');
    }
    console.log('PASS: Live catalog contract and browser CORS');

    const countries = await readApi('/locations/countries');
    assert.ok(Array.isArray(countries) && countries.some((country) => country.code === 'TZ'), 'Farm applications must be able to select Tanzania.');
    console.log('PASS: Farm application country options');

    const exchange = await readApi('/exchange-rates');
    assert.equal(exchange.base, 'TZS', 'Exchange rates must use the existing TZS base.');
    assert.equal(exchange.rates?.TZS, 1, 'The TZS exchange rate must remain unchanged.');
    console.log('PASS: Currency service');

    const homepage = await fetch(website.origin, { signal: AbortSignal.timeout(15000) });
    assert.equal(homepage.status, 200, 'The public website must return HTTP 200.');
    const html = await homepage.text();
    assert.match(html, /<h1(?:\s|>)/i, 'The public website must render its primary heading.');
    console.log('PASS: Public website response');
    console.log('Read-only integration checks passed. No accounts, orders or payments were created.');
  } catch (error) {
    console.error('Integration check failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  }
}
