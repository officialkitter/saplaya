import assert from 'node:assert/strict';
import { test } from 'node:test';

const origin = process.env.TEST_WEB_ORIGIN;
if (!origin) throw new Error('Set TEST_WEB_ORIGIN to the website instance being tested.');

async function readPage(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000) });
  return { response, html: await response.text() };
}

function readJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

for (const [path, heading, content] of [
  ['/how-it-works', 'How it works', 'Confirm your basket'],
  ['/fresh-today', 'Fresh today', 'Search products'],
  ['/for-farmers', 'For farmers', 'Apply to sell on Saplaya'],
  ['/faq', 'Questions', 'How fast is delivery?'],
  ['/help', 'Help', 'info@saplaya.org'],
]) {
  test(`${path} renders a dedicated accessible page and crawlable navigation`, async () => {
    const { response, html } = await readPage(path);
    assert.equal(response.status, 200);
    assert.equal((html.match(/<h1(?:\s|>)/gi) ?? []).length, 1);
    assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`));
    assert.ok(html.includes(content), 'Existing content must be rendered on its dedicated route.');
    for (const href of ['/how-it-works', '/fresh-today', '/for-farmers', '/faq']) {
      assert.ok(html.includes(`href="${href}"`), `Navigation must link to ${href}.`);
    }
    for (const anchor of ['#how', '#fresh', '#farmers', '#faq']) {
      assert.ok(!html.includes(`href="${anchor}"`), `Primary navigation must not rely on ${anchor}.`);
    }
    if (path === '/faq') {
      assert.match(html, /aria-label="Breadcrumb"/);
      assert.ok(html.includes('href="/help"'));
      assert.match(html, /aria-current="page">Questions</);
    }
    assert.ok(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html), 'Public content routes must be indexable.');
  });
}

test('public routes have unique concise metadata, canonical URLs and complete social tags', async () => {
  const titles = new Set();
  for (const path of ['/', '/how-it-works', '/fresh-today', '/for-farmers', '/faq', '/help', '/privacy']) {
    const { response, html } = await readPage(path);
    assert.equal(response.status, 200);
    assert.equal((html.match(/<h1(?:\s|>)/gi) ?? []).length, 1, `${path} must have exactly one h1.`);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(title && title.length < 60, `${path} must have a title under 60 characters.`);
    assert.ok(!titles.has(title), `${path} must have a unique title.`);
    titles.add(title);
    assert.ok(description && description.length < 155, `${path} must have a description under 155 characters.`);
    assert.ok(canonical, `${path} must declare a canonical URL.`);
    const canonicalUrl = new URL(canonical);
    assert.equal(canonicalUrl.origin, 'https://www.saplaya.org');
    assert.equal(canonicalUrl.pathname, path);
    assert.equal(canonicalUrl.search, '');
    assert.equal(canonicalUrl.hash, '');
    assert.match(html, /<meta property="og:title" content="[^"]+"/);
    assert.match(html, /<meta property="og:description" content="[^"]+"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/www\.saplaya\.org/);
    assert.match(html, /<meta property="og:image" content="https:\/\/www\.saplaya\.org\/saplaya-icon\.png"/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<meta name="twitter:title" content="[^"]+"/);
  }
});

test('structured data describes the site, page hierarchy and visible FAQ answers', async () => {
  const home = await readPage('/');
  const homeData = readJsonLd(home.html).find((data) => Array.isArray(data['@graph']));
  assert.ok(homeData, 'The homepage must expose the Organization and WebSite graph.');
  const organization = homeData['@graph'].find((item) => item['@type'] === 'Organization');
  const website = homeData['@graph'].find((item) => item['@type'] === 'WebSite');
  assert.equal(organization?.['@id'], 'https://www.saplaya.org/#organization');
  assert.equal(organization?.name, 'Saplaya');
  assert.equal(organization?.url, 'https://www.saplaya.org/');
  assert.match(organization?.description, /fresh produce delivery and wholesale marketplace/i);
  assert.ok(Array.isArray(organization?.sameAs));
  assert.equal(website?.name, 'Saplaya');
  assert.equal(website?.url, 'https://www.saplaya.org/');
  assert.match(home.html, /<meta property="og:site_name" content="Saplaya"/);
  assert.match(home.html, /Saplaya is a fresh produce delivery and wholesale marketplace connecting customers with local farms\./);
  assert.equal(website?.potentialAction?.['@type'], 'SearchAction');
  assert.equal(website?.potentialAction?.target, 'https://www.saplaya.org/fresh-today?q={search_term_string}');

  for (const path of ['/how-it-works', '/fresh-today', '/for-farmers', '/faq', '/help']) {
    const { html } = await readPage(path);
    const breadcrumb = readJsonLd(html).find((data) => data['@type'] === 'BreadcrumbList');
    assert.ok(breadcrumb, `${path} must expose breadcrumb structured data.`);
    assert.deepEqual(breadcrumb.itemListElement.map((item) => item.position), breadcrumb.itemListElement.map((_, index) => index + 1));
    assert.equal(breadcrumb.itemListElement.at(-1).item, `https://www.saplaya.org${path}`);
  }

  const faq = await readPage('/faq');
  const faqData = readJsonLd(faq.html).find((data) => data['@type'] === 'FAQPage');
  assert.equal(faqData?.mainEntity?.length, 7);
  assert.equal(faqData?.mainEntity?.[0]?.name, 'How fast is delivery?');
  assert.match(faq.html, /How fast is delivery\?/);
});

test('robots and dynamic sitemap expose public pages, categories and products', async () => {
  const [robots, sitemap] = await Promise.all([readPage('/robots.txt'), readPage('/sitemap.xml')]);
  assert.equal(robots.response.status, 200);
  assert.match(robots.html, /User-Agent: \*/i);
  assert.match(robots.html, /Allow: \//i);
  assert.match(robots.html, /Sitemap: https:\/\/www\.saplaya\.org\/sitemap\.xml/i);
  assert.match(robots.html, /Disallow: \/admin(?:\/|\s)/i);
  assert.match(robots.html, /Disallow: \/login/i);
  assert.match(robots.html, /Disallow: \/account(?:\/|\s)/i);

  assert.equal(sitemap.response.status, 200);
  const entries = [...sitemap.html.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<priority>([^<]+)<\/priority>[\s\S]*?<\/url>/g)];
  const priorities = new Map(entries.map((entry) => [entry[1], Number(entry[2])]));
  assert.ok(entries.length >= 7);
  assert.match(sitemap.html, /<lastmod>\d{4}-\d{2}-\d{2}/);
  assert.equal(priorities.get('https://www.saplaya.org/'), 1);
  for (const path of ['/how-it-works', '/fresh-today', '/for-farmers', '/faq', '/help']) {
    assert.equal(priorities.get(`https://www.saplaya.org${path}`), 0.8);
  }
  assert.equal(priorities.get('https://www.saplaya.org/privacy'), 0.4);
  const productUrl = entries.map((entry) => entry[1]).find((url) => /\/products\/[0-9a-f-]{36}$/i.test(url));
  const categoryUrl = entries.map((entry) => entry[1]).find((url) => /\/fresh-today\?category=/i.test(url));
  if (productUrl) {
    const url = new URL(productUrl);
    const [{ response, html }, home] = await Promise.all([
      readPage(url.pathname),
      readPage('/'),
    ]);
    assert.equal(response.status, 200);
    assert.equal((html.match(/<h1(?:\s|>)/gi) ?? []).length, 1);
    const productData = readJsonLd(html).find((data) => data['@type'] === 'Product');
    assert.ok(productData?.name, 'Product detail must expose server-rendered Product JSON-LD.');
    assert.ok(html.includes(productData.name), 'The product name must be rendered in initial HTML.');
    assert.ok(home.html.includes(productData.name), 'A listed product name must be rendered in the initial homepage HTML.');
    assert.equal(productData.offers?.url, productUrl);
  }
  if (categoryUrl) {
    const url = new URL(categoryUrl);
    const { response, html } = await readPage(`${url.pathname}${url.search}`);
    assert.equal(response.status, 200);
    assert.match(html, /Search results|Fresh today/);
  }
  assert.doesNotMatch(sitemap.html, /\/(admin|auth|checkout|orders|401|403|server-error)(\/|<)/);
});

test('the official apex HTTP host permanently redirects to the HTTPS www host', async () => {
  const originUrl = new URL(origin);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname);
  const redirectUrl = isLocal
    ? new URL('/fresh-today?q=carrots', origin)
    : new URL('http://saplaya.org/fresh-today?q=carrots');
  const response = await fetch(redirectUrl, {
    ...(isLocal ? { headers: { 'x-forwarded-host': 'saplaya.org', 'x-forwarded-proto': 'http' } } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://www.saplaya.org/fresh-today?q=carrots');
});

test('the homepage retains all existing storefront sections', async () => {
  const { response, html } = await readPage('/');
  assert.equal(response.status, 200);
  for (const section of ['how', 'fresh', 'farmers', 'faq', 'download']) {
    assert.ok(html.includes(`id="${section}"`), `The existing ${section} section must remain available.`);
  }
  assert.ok(html.includes('Shopping mode'));
  assert.ok(html.includes('Wholesale'));
  assert.ok(html.includes('Retail'));
});

test('an unknown page returns a real 404 with recovery navigation', async () => {
  const { response, html } = await readPage('/__saplaya_missing_page__');
  assert.equal(response.status, 404);
  assert.ok(html.includes('href="/"'), 'A missing page must offer a way home.');
  assert.ok(!html.includes('Error: NEXT_') && !html.includes('Unhandled Runtime Error'));
});

for (const path of ['/401', '/403', '/server-error']) {
  test(`${path} offers a non-indexable recovery page`, async () => {
    const { response, html } = await readPage(path);
    assert.equal(response.status, 200, 'Explicit recovery URLs are ordinary pages, not substitutes for API authorization status codes.');
    assert.equal((html.match(/<h1(?:\s|>)/gi) ?? []).length, 1);
    assert.match(html, /<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i);
    assert.ok(html.includes(path === '/401' ? 'href="/login"' : 'href="/"'));
    assert.ok(!html.includes('href="/support"'), 'Recovery links must not point to an unimplemented support route.');
  });
}
