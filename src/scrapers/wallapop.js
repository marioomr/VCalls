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

const axios  = require('axios');
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
// Tier 1 — Direct API call via axios (handles gzip/deflate automatically)
// ----------------------------------------------------------------------------

// Wallapop has changed their API endpoint several times — try each in order.
const API_ENDPOINT_CANDIDATES = [
  'https://api.wallapop.com/api/v3/search',
  'https://api.wallapop.com/api/v3/general_search',
  'https://api.wallapop.com/api/v3/search/general',
];

const API_HEADERS = {
  'Accept':          'application/json',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'DeviceOS':        '0',
  'Origin':          'https://es.wallapop.com',
  'Referer':         'https://es.wallapop.com/',
  'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

async function fetchDirectApi(opts) {
  const params = {
    keywords:       opts.keywords,
    order_by:       opts.orderBy,
    latitude:       opts.latitude,
    longitude:      opts.longitude,
    distance:       opts.distance,
    step:           40,
    start:          0,
    filters_source: 'default_filters',
  };

  console.log(`[Wallapop] API directa: q="${opts.keywords}"`);

  for (const base of API_ENDPOINT_CANDIDATES) {
    const tag = base.split('/').pop();
    try {
      const res   = await axios.get(base, { params, headers: API_HEADERS, timeout: 20000 });
      const items = parseItems(res.data);
      if (items.length > 0) {
        console.log(`[Wallapop] ${items.length} artículos vía API (${tag}) q="${opts.keywords}".`);
        return items;
      }
      console.warn(`[Wallapop] API (${tag}) respondió pero sin items: ${JSON.stringify(res.data).slice(0, 150)}`);
    } catch (err) {
      const status  = err.response?.status;
      const snippet = err.response?.data ? JSON.stringify(err.response.data).slice(0, 150) : '';
      console.warn(`[Wallapop] API fallida (${tag}): ${status || err.message}${snippet ? ' — ' + snippet : ''}`);
    }
  }
  return [];
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
  let capturedItems = [];

  try {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });

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

    // Event-based capture: collects ALL api.wallapop.com responses,
    // not just a single matching one. More robust than waitForResponse.
    page.on('response', async (res) => {
      if (!res.url().includes('api.wallapop.com')) return;
      console.log(`[Wallapop] XHR interceptado: ${res.status()} ${res.url().split('?')[0]}`);
      if (res.status() < 200 || res.status() >= 300) return;
      if (capturedItems.length > 0) return; // already got results
      try {
        const data  = await res.json();
        const items = parseItems(data);
        if (items.length > 0) {
          capturedItems = items;
          console.log(`[Wallapop] ${items.length} artículos interceptados del navegador (q="${opts.keywords}").`);
        } else {
          console.warn(`[Wallapop] XHR sin items: ${JSON.stringify(data).slice(0, 150)}`);
        }
      } catch { /* binary/non-JSON response — skip */ }
    });

    console.log(`[Wallapop] Navegador: ${searchUrl}`);

    // 'domcontentloaded' instead of 'networkidle2':
    // networkidle2 NEVER completes on Cloudflare/Angular pages from a headless
    // server, always timing out at 50s and returning [] silently.
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      // A navigation timeout is non-fatal — the page may be partially loaded
      // and the XHR listener may already have captured data.
      console.warn(`[Wallapop] Advertencia de navegación: ${navErr.message}`);
    }

    // Wait for the Angular app to bootstrap and fire its search XHR.
    // /v3/search/section fires later than the initial component XHRs.
    await new Promise(r => setTimeout(r, 12000));

    if (capturedItems.length > 0) return capturedItems;

    // DOM fallback — try Angular web components and classic selectors.
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
    // Wallapop uses Angular web components (tsl-*) — these must come first.
    // The class-based selectors are kept as fallback for older page versions.
    const CARD_SEL =
      'tsl-item-card, tsl-public-item-card, ' +
      '[data-testid="ItemCardComponent"], [data-testid="item-card"], ' +
      '[class*="ItemCard"], [class*="item-card"], ' +
      'article[class*="item"], a[href*="/item/"]';

    await page.waitForSelector(CARD_SEL, { timeout: 12000 }).catch(() => {});

    // Extra wait: Angular may still be rendering child components
    await new Promise(r => setTimeout(r, 2000));

    return await page.$$eval(CARD_SEL, (cards) =>
      cards.map(card => {
        const anchor  = card.tagName === 'A' ? card : card.querySelector('a[href]');
        const href    = anchor?.getAttribute('href') || '';
        const link    = href.startsWith('http')
          ? href : href ? `https://es.wallapop.com${href}` : '';
        const id      = href.split('/').pop()?.split('?')[0] || '';
        if (!id) return null;
        const nameEl  = card.querySelector('[class*="title"], [class*="name"], h2, h3, p');
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
    data?.data?.section?.items         ||   // /v3/search/section (current endpoint)
    data?.data?.section?.payload?.items ||   // legacy endpoint format
    data?.search_objects                ||   // older search API
    data?.data?.items                   ||   // generic data.data.items
    data?.items                         ||   // generic .items
    data?.result?.items                 ||   // result wrapper
    data?.results                       ||   // flat results array
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
