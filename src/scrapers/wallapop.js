'use strict';

/**
 * src/scrapers/wallapop.js
 * ------------------------
 * Scraper for Wallapop using the official internal API:
 *   GET https://api.wallapop.com/api/v3/search/section
 *
 * Falls back to Puppeteer if the API is blocked (e.g. server IP rate-limited).
 *
 * Supported filter fields (set in filters.json per-filter):
 *   query        — search keywords (required)
 *   latitude     — decimal degrees (default: 40.4168 / Madrid)
 *   longitude    — decimal degrees (default: -3.7038)
 *   distance     — in km (default: 200)
 *   orderBy      — "newest" | "price_low_to_high" | "price_high_to_low" (default: newest)
 *   categoryId   — Wallapop category ID, e.g. 24200 (phones), 12900 (gaming)
 *   priceMin     — minimum price in €
 *   priceMax     — maximum price in €
 *   condition    — "new" | "as_good_as_new" | "good" | "fair" | "has_given_it_all"
 */

const axios  = require('axios');
const crypto = require('crypto');
const { getBrowser, closeBrowser, isFatalBrowserError } = require('../utils/browser');

const DEFAULT_LATITUDE  = 40.4168;
const DEFAULT_LONGITUDE = -3.7038;
const DEFAULT_DISTANCE  = 200;   // km

// Static identifiers — generated once per process, mimics a real browser session
const DEVICE_ID      = crypto.randomUUID();
const TRACKING_ID    = String(Math.floor(Math.random() * 9e18) + 1e18);

// Resource blocking list for Puppeteer fallback
const BLOCKED_TYPES   = new Set(['image', 'imageset', 'media', 'font', 'stylesheet', 'manifest']);
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'hotjar.com', 'segment.com', 'amplitude.com',
  'sentry.io', 'newrelic.com', 'nr-data.net',
];

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Fetch Wallapop listings.
 * @param {object} options
 * @param {string}  options.keywords
 * @param {number}  [options.latitude]
 * @param {number}  [options.longitude]
 * @param {number}  [options.distance]     — km
 * @param {string}  [options.orderBy]
 * @param {number}  [options.categoryId]
 * @param {number}  [options.priceMin]
 * @param {number}  [options.priceMax]
 * @param {string}  [options.condition]
 */
async function fetchListings(options) {
  const {
    keywords,
    latitude   = DEFAULT_LATITUDE,
    longitude  = DEFAULT_LONGITUDE,
    distance   = DEFAULT_DISTANCE,
    orderBy    = 'newest',
    categoryId,
    priceMin,
    priceMax,
    condition,
  } = options || {};

  if (!keywords) {
    console.warn('[Wallapop] No se especificaron keywords.');
    return [];
  }

  const opts = { keywords, latitude, longitude, distance, orderBy, categoryId, priceMin, priceMax, condition };

  // Tier 1: direct API call
  const apiItems = await fetchDirectApi(opts);
  if (apiItems.length > 0) return apiItems;

  // Tier 2: Puppeteer fallback (intercepts the same API call from inside the browser)
  console.warn('[Wallapop] API directa sin resultados — usando navegador...');
  return fetchViaPuppeteer(opts);
}

// ----------------------------------------------------------------------------
// Tier 1 — Direct API call
// ----------------------------------------------------------------------------

async function fetchDirectApi(opts) {
  // distance parameter: filterManager may pass it in metres (200000) or km (200).
  // Normalise: if value > 2000 assume it's in metres, convert to km.
  const distanceKm = opts.distance > 2000 ? Math.round(opts.distance / 1000) : opts.distance;

  const params = {
    keywords:              opts.keywords,
    source:                'search_box',
    order_by:              opts.orderBy,
    latitude:              opts.latitude,
    longitude:             opts.longitude,
    distance_in_km:        distanceKm,
    section_type:          'organic_search_results',
    search_id:             crypto.randomUUID(),
  };

  if (opts.categoryId) params.category_id    = opts.categoryId;
  if (opts.priceMin  ) params.min_sale_price  = opts.priceMin;
  if (opts.priceMax  ) params.max_sale_price  = opts.priceMax;
  if (opts.condition ) params.condition_of_good_key = opts.condition;

  const filterDesc = [
    opts.categoryId ? `cat=${opts.categoryId}` : null,
    opts.priceMin   ? `min=${opts.priceMin}€`  : null,
    opts.priceMax   ? `max=${opts.priceMax}€`  : null,
    opts.condition  ? `cond=${opts.condition}` : null,
  ].filter(Boolean).join(' ');

  console.log(`[Wallapop] API: q="${opts.keywords}"${filterDesc ? ' ' + filterDesc : ''} dist=${distanceKm}km`);

  try {
    const res = await axios.get('https://api.wallapop.com/api/v3/search/section', {
      params,
      timeout: 20000,
      headers: {
        'accept':           'application/json, text/plain, */*',
        'accept-language':  'es,es-ES;q=0.9,en;q=0.8',
        'deviceos':         '0',
        'mpid':             TRACKING_ID,
        'trackinguserid':   TRACKING_ID,
        'x-appversion':     '817640',
        'x-deviceid':       DEVICE_ID,
        'x-deviceos':       '0',
        'origin':           'https://es.wallapop.com',
        'referer':          'https://es.wallapop.com/',
        'sec-fetch-dest':   'empty',
        'sec-fetch-mode':   'cors',
        'sec-fetch-site':   'same-site',
        'user-agent':       'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
    });

    const items = parseItems(res.data);
    if (items.length > 0) {
      console.log(`[Wallapop] ${items.length} artículos vía API (q="${opts.keywords}").`);
    } else {
      console.warn(`[Wallapop] API respondió pero sin items. Respuesta: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
    return items;
  } catch (err) {
    const status  = err.response?.status;
    const snippet = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : '';
    console.warn(`[Wallapop] API fallida: ${status || err.message}${snippet ? ' — ' + snippet : ''}`);
    return [];
  }
}

// ----------------------------------------------------------------------------
// Tier 2 — Puppeteer fallback (intercepts the same API call from the browser)
// ----------------------------------------------------------------------------

async function fetchViaPuppeteer(opts) {
  const distanceKm = opts.distance > 2000 ? Math.round(opts.distance / 1000) : opts.distance;

  let searchUrl =
    `https://es.wallapop.com/app/search?keywords=${encodeURIComponent(opts.keywords)}` +
    `&order_by=${opts.orderBy}&distance=${distanceKm}` +
    `&latitude=${opts.latitude}&longitude=${opts.longitude}`;

  if (opts.categoryId) searchUrl += `&category_ids=${opts.categoryId}`;
  if (opts.priceMin  ) searchUrl += `&min_sale_price=${opts.priceMin}`;
  if (opts.priceMax  ) searchUrl += `&max_sale_price=${opts.priceMax}`;
  if (opts.condition ) searchUrl += `&condition_of_good_key=${opts.condition}`;

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
      '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'accept-language': 'es-ES,es;q=0.9' });

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

    // Intercept /search/section responses — the only endpoint with actual listings
    page.on('response', async (res) => {
      if (!res.url().includes('api.wallapop.com/api/v3/search/section')) return;
      if (res.status() < 200 || res.status() >= 300) return;
      if (capturedItems.length > 0) return;
      try {
        const data  = await res.json();
        const items = parseItems(data);
        if (items.length > 0) {
          capturedItems = items;
          console.log(`[Wallapop] ${items.length} artículos interceptados vía navegador (q="${opts.keywords}").`);
        } else {
          console.warn(`[Wallapop] /search/section sin items: ${JSON.stringify(data).slice(0, 200)}`);
        }
      } catch { /* binary/non-JSON — skip */ }
    });

    console.log(`[Wallapop] Navegador: ${searchUrl}`);
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      console.warn(`[Wallapop] Advertencia de navegación: ${navErr.message}`);
    }

    // Wait for Angular to bootstrap and fire the search XHR
    await new Promise(r => setTimeout(r, 12000));

    if (capturedItems.length > 0) return capturedItems;

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
// DOM fallback — Wallapop Angular web components
// ----------------------------------------------------------------------------

async function extractFromDOM(page) {
  try {
    const CARD_SEL =
      'tsl-item-card, tsl-public-item-card, ' +
      '[data-testid="ItemCardComponent"], [data-testid="item-card"], ' +
      '[class*="ItemCard"], [class*="item-card"], ' +
      'article[class*="item"], a[href*="/item/"]';

    await page.waitForSelector(CARD_SEL, { timeout: 12000 }).catch(() => {});
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
// Parse items from /api/v3/search/section response
// ----------------------------------------------------------------------------

function parseItems(data) {
  // Primary path: /v3/search/section → data.data.section.items
  const raw =
    data?.data?.section?.items          ||
    data?.data?.section?.payload?.items ||  // legacy format (older endpoint)
    data?.search_objects                ||
    data?.data?.items                   ||
    data?.items                         ||
    data?.results                       ||
    [];

  if (!Array.isArray(raw)) {
    console.warn('[Wallapop] Respuesta inesperada:', JSON.stringify(data).slice(0, 300));
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
