'use strict';

/**
 * src/scrapers/wallapop.js
 * ------------------------
 * Two-tier scraper for Wallapop:
 *
 *  1. Direct HTTPS call to Wallapop's internal API — no browser needed,
 *     fast and reliable even on headless servers.
 *  2. Puppeteer fallback with request interception — used only when the
 *     direct API call is blocked or returns no results.
 *
 * Used by both the Electron app (main.js) and the server (filterManager.js).
 */

const https = require('https');
const { getBrowser, closeBrowser, isFatalBrowserError } = require('../utils/browser');

const DEFAULT_LATITUDE  = 40.4168;
const DEFAULT_LONGITUDE = -3.7038;
const DEFAULT_DISTANCE  = 200000;

// -- Resource blocking for Puppeteer fallback --------------------------------
const BLOCKED_TYPES = new Set(['image', 'imageset', 'media', 'font', 'stylesheet', 'manifest']);
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'hotjar.com', 'segment.com', 'amplitude.com',
  'sentry.io', 'newrelic.com', 'nr-data.net',
];

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

async function fetchListings(options) {
  const {
    keywords,
    latitude  = DEFAULT_LATITUDE,
    longitude = DEFAULT_LONGITUDE,
    distance  = DEFAULT_DISTANCE,
    orderBy   = 'newest',
  } = options || {};

  if (!keywords) {
    console.warn('[Wallapop] No se especificaron keywords.');
    return [];
  }

  const opts = { keywords, latitude, longitude, distance, orderBy };

  // Tier 1: direct API — no browser, works on any server
  const apiItems = await fetchDirectApi(opts);
  if (apiItems.length > 0) return apiItems;

  // Tier 2: Puppeteer with request interception
  console.warn('[Wallapop] API directa sin resultados — usando navegador...');
  return fetchViaPuppeteer(opts);
}

// ----------------------------------------------------------------------------
// Tier 1 — Direct HTTPS call
// ----------------------------------------------------------------------------

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON inválido: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Timeout directo')); });
  });
}

async function fetchDirectApi(opts) {
  const params = new URLSearchParams({
    keywords:       opts.keywords,
    order_by:       opts.orderBy,
    latitude:       opts.latitude,
    longitude:      opts.longitude,
    distance:       opts.distance,
    step:           40,
    start:          0,
    filters_source: 'default_filters',
  });

  const url = `https://api.wallapop.com/api/v3/general_search?${params}`;
  console.log(`[Wallapop] API directa: q="${opts.keywords}"`);

  try {
    const data = await httpsGet(url, {
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'DeviceOS':        '0',
      'Origin':          'https://es.wallapop.com',
      'Referer':         'https://es.wallapop.com/',
      'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    const items = parseItems(data);
    if (items.length > 0) {
      console.log(`[Wallapop] ${items.length} artículos vía API directa (q="${opts.keywords}").`);
    }
    return items;
  } catch (err) {
    console.warn(`[Wallapop] API directa fallida: ${err.message}`);
    return [];
  }
}

// ----------------------------------------------------------------------------
// Tier 2 — Puppeteer with response interception
// ----------------------------------------------------------------------------

async function fetchViaPuppeteer(opts) {
  const searchUrl =
    `https://es.wallapop.com/app/search?keywords=${encodeURIComponent(opts.keywords)}` +
    `&order_by=${opts.orderBy}&distance=${opts.distance}` +
    `&latitude=${opts.latitude}&longitude=${opts.longitude}`;

  let browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.error('[Wallapop] Error al iniciar Chrome:', err.message);
    return [];
  }

  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-ES,es;q=0.9',
    });

    await page.setRequestInterception(true);
    page.on('request', req => {
      if (
        BLOCKED_TYPES.has(req.resourceType()) ||
        BLOCKED_DOMAINS.some(d => req.url().includes(d))
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Intercept the Wallapop search API response
    const apiResponsePromise = page.waitForResponse(
      res =>
        res.url().includes('api.wallapop.com') &&
        (res.url().includes('/search') || res.url().includes('/general_search')) &&
        res.status() >= 200 && res.status() < 300,
      { timeout: 40000 }
    ).catch(() => null);

    console.log(`[Wallapop] Navegador: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Give JS a moment to fire the search XHR after DOM is ready
    await new Promise(r => setTimeout(r, 3000));

    const apiResponse = await apiResponsePromise;
    if (apiResponse) {
      try {
        const data  = await apiResponse.json();
        const items = parseItems(data);
        if (items.length > 0) {
          console.log(`[Wallapop] ${items.length} artículos vía navegador (q="${opts.keywords}").`);
          return items;
        }
      } catch { /* fall through */ }
    }

    // DOM fallback
    const domItems = await extractFromDOM(page);
    console.log(`[Wallapop] ${domItems.length} artículos del DOM (q="${opts.keywords}").`);
    return domItems;

  } catch (err) {
    console.error('[Wallapop] Error de scraping:', err.message);
    if (isFatalBrowserError(err)) await closeBrowser();
    return [];
  } finally {
    try { if (!page.isClosed()) await page.close(); } catch {}
  }
}

// ----------------------------------------------------------------------------
// DOM fallback
// ----------------------------------------------------------------------------

async function extractFromDOM(page) {
  try {
    const CARD_SEL =
      '[class*="ItemCard"], [class*="item-card"], ' +
      '[data-testid*="item"], article[class*="item"], ' +
      'a[href*="/item/"]';

    await page.waitForSelector(CARD_SEL, { timeout: 8000 }).catch(() => {});

    return await page.$$eval(CARD_SEL, (cards) =>
      cards.map(card => {
        const anchor  = card.tagName === 'A' ? card : card.querySelector('a[href]');
        const href    = anchor?.getAttribute('href') || '';
        const link    = href.startsWith('http')
          ? href : href ? `https://es.wallapop.com${href}` : '';
        const id      = href.split('/').pop()?.split('?')[0] || '';
        if (!id) return null;
        const nameEl  = card.querySelector('[class*="title"], [class*="name"], h2, h3');
        const name    = (nameEl?.innerText || anchor?.innerText || '').trim().split('\n')[0];
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        const price   = (priceEl?.innerText || '').trim();
        return { id, name, price, link };
      }).filter(Boolean).filter(i => i.id)
    );
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// JSON parsers
// ----------------------------------------------------------------------------

function parseItems(data) {
  const raw =
    data?.data?.section?.payload?.items ||
    data?.search_objects ||
    data?.data?.items    ||
    data?.items          ||
    [];

  if (!Array.isArray(raw)) {
    console.warn('[Wallapop] Respuesta inesperada:', JSON.stringify(data).slice(0, 200));
    return [];
  }

  return raw
    .map((item) => {
      const content = item?.content || item;
      const id      = String(content?.id || '');
      if (!id) return null;

      const title   = content?.title || 'Sin título';
      const webSlug = content?.web_slug || content?.slug || '';
      const link    = webSlug
        ? `https://es.wallapop.com/item/${webSlug}`
        : 'https://es.wallapop.com';

      const price = formatPrice(content?.price);
      return { id, name: title, price, link };
    })
    .filter(Boolean);
}

function formatPrice(price) {
  if (!price) return 'Precio no disponible';
  if (typeof price === 'object') {
    const amount   = price.amount ?? price.price ?? '';
    const currency = price.currency ?? '€';
    return `${amount} ${currency}`;
  }
  return String(price);
}

module.exports = { fetchListings, closeBrowser };
