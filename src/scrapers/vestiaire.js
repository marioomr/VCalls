/**
 * src/scrapers/vestiaire.js
 * -------------------------
 * Scraper ligero para el modo servidor (npm start).
 *
 * - Usa el singleton de Chrome compartido (src/utils/browser.js).
 * - Bloquea imágenes, fuentes, media, hojas de estilo y trackers.
 * - Captura la respuesta JSON interna de la API de Vestiaire.
 * - Fallback a DOM y a JSON embebido si la API no responde.
 * - No incluye el campo `image` para reducir payload.
 */

'use strict';

const { getBrowser, closeBrowser, isFatalBrowserError } = require('../utils/browser');

// Tipos de recurso que no aportan nada al scraping
const BLOCKED_TYPES = new Set(['image', 'imageset', 'media', 'font', 'stylesheet', 'texttrack', 'eventsource', 'manifest']);

// Dominios de tracking/analytics que sólo añaden latencia
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'hotjar.com', 'segment.com', 'amplitude.com',
  'sentry.io', 'newrelic.com', 'nr-data.net', 'mixpanel.com',
];

const SORT_MAP = { recency: 3, price_asc: 1, price_desc: 2 };

/**
 * @param {object} [options]
 * @param {string} [options.query]  - Search term. Falls back to SEARCH_QUERY env var.
 * @param {string} [options.sort]   - Sort order: recency | price_asc | price_desc. Falls back to SEARCH_SORT env var.
 * @returns {Promise<Array<{id, name, price, link}>>}
 */
async function fetchListings(options = {}) {
  const q       = options.query || process.env.SEARCH_QUERY || 'balenciaga';
  const sortKey = options.sort  || process.env.SEARCH_SORT  || 'recency';
  const sortNum = SORT_MAP[sortKey] ?? 3;
  const url     = `https://es.vestiairecollective.com/search/?q=${encodeURIComponent(q)}&sortBy=${sortNum}`;

  let browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.error('[Vestiaire] Error al iniciar Chrome:', err.message);
    return [];
  }

  const page = await browser.newPage();
  try {
    // Anti-detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Block heavy resources — this is the main performance win on a VPS
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

    console.log(`[Vestiaire] Cargando: ${url}`);

    // Intercept the internal API response; don't let it block navigation on failure
    const apiResponsePromise = page.waitForResponse(
      res =>
        res.url().includes('/v1/product/search') &&
        res.request().method() === 'POST' &&
        res.status() >= 200 && res.status() < 300,
      { timeout: 45000 }
    ).catch(() => null);

    // domcontentloaded is enough — we don't need JS hydration to finish
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const apiResponse = await apiResponsePromise;
    if (apiResponse) {
      try {
        const data  = await apiResponse.json();
        const items = parseApiProducts(data);
        if (items.length > 0) {
          console.log(`[Vestiaire] ${items.length} artículos vía API (q="${q}").`);
          return items;
        }
      } catch { /* fall through */ }
    }

    // Fallback 1: DOM cards
    console.warn('[Vestiaire] Sin respuesta de API — extrayendo del DOM...');
    const domItems = await extractFromDOM(page);
    if (domItems.length > 0) {
      console.log(`[Vestiaire] ${domItems.length} artículos del DOM (q="${q}").`);
      return domItems;
    }

    // Fallback 2: embedded __NEXT_DATA__ JSON
    const jsonItems = await extractFromEmbeddedJson(page);
    console.log(`[Vestiaire] ${jsonItems.length} artículos vía JSON embebido (q="${q}").`);
    return jsonItems;

  } catch (err) {
    console.error('[Vestiaire] Error de scraping:', err.message);
    if (isFatalBrowserError(err)) await closeBrowser();
    return [];
  } finally {
    try { if (!page.isClosed()) await page.close(); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseApiProducts(data) {
  const raw =
    data?.items ||
    data?.products ||
    data?.data?.items ||
    data?.results ||
    [];

  if (!Array.isArray(raw)) {
    console.warn('[Vestiaire] Respuesta inesperada:', JSON.stringify(data).slice(0, 200));
    return [];
  }

  return raw
    .map(p => ({
      id:    String(p.id || p.itemId || ''),
      name:  [p.brand?.name, p.name, p.model].filter(Boolean).join(' ') || 'Artículo sin nombre',
      price: formatPrice(p.price),
      link:  formatLink(p.link),
    }))
    .filter(p => p.id);
}

async function extractFromDOM(page) {
  try {
    const SEL =
      '[data-testid="product-card"], article[data-id], '
      + '[class*="ProductCard"], [class*="product-card"], [class*="productCard"]';
    await page.waitForSelector(SEL, { timeout: 10000 }).catch(() => {});

    return await page.$$eval(SEL, cards =>
      cards.map(card => {
        const id      = card.dataset.id || card.dataset.productId || '';
        const anchor  = card.querySelector('a[href]');
        const href    = anchor?.getAttribute('href') || '';
        const link    = href.startsWith('http') ? href
          : href ? `https://es.vestiairecollective.com${href}` : '';
        const nameEl  = card.querySelector('[data-testid="product-name"], [class*="name"], [class*="title"], h2, h3');
        const name    = (nameEl?.innerText || anchor?.innerText || '').trim().split('\n')[0];
        const priceEl = card.querySelector('[data-testid="product-price"], [class*="price"], [class*="Price"]');
        const price   = (priceEl?.innerText || '').trim();
        return { id: String(id || link), name, price, link };
      }).filter(i => i.id)
    );
  } catch {
    return [];
  }
}

async function extractFromEmbeddedJson(page) {
  try {
    const raw = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : '';
    });
    if (!raw) return [];
    const arr = findProductArray(JSON.parse(raw));
    return arr || [];
  } catch {
    return [];
  }
}

function findProductArray(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0] && (obj[0].id || obj[0].itemId) && (obj[0].name || obj[0].brand)) {
      return obj.map(p => ({
        id:    String(p.id || p.itemId || ''),
        name:  [p.brand?.name, p.name, p.model].filter(Boolean).join(' ') || 'Artículo sin nombre',
        price: formatPrice(p.price),
        link:  formatLink(p.link),
      })).filter(i => i.id);
    }
    for (const item of obj) { const f = findProductArray(item, depth + 1); if (f) return f; }
    return null;
  }
  for (const val of Object.values(obj)) { const f = findProductArray(val, depth + 1); if (f) return f; }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price) {
  if (!price) return 'Precio no disponible';
  if (typeof price === 'object') {
    const amount   = price.amount ?? (price.cents != null ? price.cents / 100 : '');
    const currency = price.currency ?? '€';
    return `${amount} ${currency}`.trim();
  }
  return String(price);
}

function formatLink(link) {
  if (!link) return 'https://es.vestiairecollective.com';
  if (link.startsWith('http')) return link;
  return `https://es.vestiairecollective.com${link}`;
}

// Re-export from shared utility so src/index.js keeps working
module.exports = { fetchListings, closeBrowser };
