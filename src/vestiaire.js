/**
 * src/vestiaire.js
 * ----------------
 * Puppeteer-core scraper para la app Electron.
 * Acepta un parámetro `query` en lugar de leer de variables de entorno.
 *
 * - Sin axios, sin cookies manuales.
 * - Bloquea imágenes, fuentes y trackers para cargar más rápido.
 * - Browser singleton compartido entre todos los filtros activos.
 */

'use strict';

const puppeteer = require('puppeteer-core');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const BLOCKED_TYPES   = new Set(['image', 'font', 'media']);
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'hotjar.com', 'segment.com', 'amplitude.com',
];

// Sort: recency=3, price_asc=1, price_desc=2
const DEFAULT_SORT = 3;

let _browser = null;

async function getBrowser() {
  if (!_browser || !_browser.isConnected()) {
    _browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });
  }
  return _browser;
}

/**
 * Abre la página de búsqueda de Vestiaire y extrae los productos del DOM.
 *
 * @param {string} query  - Término de búsqueda
 * @returns {Promise<Array<{id, name, price, link, image}>>}
 */
async function fetchListings(query) {
  const q   = query || 'balenciaga';
  const url = `https://es.vestiairecollective.com/search/?q=${encodeURIComponent(q)}&sortBy=${DEFAULT_SORT}`;

  let browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.error('[Vestiaire] Error al iniciar Chrome:', err.message);
    _browser = null;
    return [];
  }

  const page = await browser.newPage();
  try {
    // Hide automation signal
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources
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
    const apiResponsePromise = page.waitForResponse(
      res =>
        res.url().includes('/v1/product/search') &&
        res.request().method() === 'POST' &&
        res.status() >= 200 &&
        res.status() < 300,
      { timeout: 35000 }
    ).catch(() => null);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // First strategy: parse product payload returned by the page's own search request.
    const apiResponse = await apiResponsePromise;
    if (apiResponse) {
      try {
        const apiData = await apiResponse.json();
        const apiItems = parseApiProducts(apiData);
        if (apiItems.length > 0) {
          console.log(`[Vestiaire] ${apiItems.length} artículos vía respuesta interna (q="${q}").`);
          return apiItems;
        }
      } catch {
        // Keep going with DOM extraction fallback.
      }
    }

    const CARD_SEL =
      '[data-testid="product-card"], ' +
      'article[data-id], ' +
      '[class*="ProductCard"], ' +
      '[class*="product-card"], ' +
      '[class*="productCard"]';

    await page.waitForSelector(CARD_SEL, { timeout: 20000 }).catch(() => {
      console.warn('[Vestiaire] Selector de tarjetas no encontrado; extrayendo igualmente...');
    });

    const items = await page.$$eval(CARD_SEL, cards =>
      cards.map(card => {
        const id =
          card.dataset.id ||
          card.dataset.productId ||
          card.querySelector('[data-id]')?.dataset.id ||
          '';

        const anchor = card.querySelector('a[href]');
        const href   = anchor?.getAttribute('href') || '';
        const link   = href.startsWith('http') ? href
          : href ? `https://es.vestiairecollective.com${href}` : '';

        const nameEl = card.querySelector(
          '[data-testid="product-name"], [class*="name"], [class*="title"], h2, h3'
        );
        const name = (nameEl?.innerText || anchor?.innerText || '').trim().split('\n')[0];

        const priceEl = card.querySelector(
          '[data-testid="product-price"], [class*="price"], [class*="Price"]'
        );
        const price = (priceEl?.innerText || '').trim();

        const img   = card.querySelector('img');
        const image = img?.getAttribute('src') || img?.dataset?.src || null;

        return { id: String(id), name, price, link, image };
      })
    );

    // Fallback: extract from embedded JSON (__NEXT_DATA__)
    if (items.length === 0) {
      const jsonItems = await extractFromEmbeddedJson(page);
      console.log(`[Vestiaire] ${jsonItems.length} artículos vía JSON embebido (q="${q}").`);
      return jsonItems;
    }

    // Use link as id fallback if no data-id
    items.forEach(i => { if (!i.id && i.link) i.id = i.link; });
    const valid = items.filter(i => i.id);

    console.log(`[Vestiaire] ${valid.length} artículos del DOM (q="${q}").`);
    return valid;

  } catch (err) {
    console.error('[Vestiaire] Error de scraping:', err.message);
    try { await _browser.close(); } catch {}
    _browser = null;
    return [];
  } finally {
    try { await page.close(); } catch {}
  }
}

function parseApiProducts(data) {
  const raw =
    data?.items ||
    data?.products ||
    data?.data?.items ||
    data?.results ||
    [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map(p => ({
      id: String(p.id || p.itemId || ''),
      name: buildName(p.brand?.name, p.name, p.model),
      price: formatPrice(p.price),
      link: formatLink(p.link),
      image:
        p.picture?.url ||
        (Array.isArray(p.picture) ? p.picture[0]?.url : null) ||
        p.imageUrl ||
        null,
    }))
    .filter(i => i.id);
}

// ---------------------------------------------------------------------------
// Fallback: embedded JSON
// ---------------------------------------------------------------------------

async function extractFromEmbeddedJson(page) {
  try {
    const raw = await page.evaluate(() => {
      const next = document.getElementById('__NEXT_DATA__');
      if (next) return next.textContent;
      return [...document.querySelectorAll('script[type="application/json"]')]
        .map(b => b.textContent).join('\n---\n');
    });

    for (const part of raw.split('---')) {
      try {
        const arr = findProductArray(JSON.parse(part.trim()));
        if (arr) return arr;
      } catch {}
    }
  } catch {}
  return [];
}

function findProductArray(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0] && (obj[0].id || obj[0].itemId) && (obj[0].name || obj[0].brand)) {
      return obj.map(p => ({
        id:    String(p.id || p.itemId || ''),
        name:  buildName(p.brand?.name, p.name, p.model),
        price: formatPrice(p.price),
        link:  formatLink(p.link),
        image: p.picture?.url || p.imageUrl || null,
      })).filter(i => i.id);
    }
    for (const item of obj) {
      const f = findProductArray(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  for (const val of Object.values(obj)) {
    const f = findProductArray(val, depth + 1);
    if (f) return f;
  }
  return null;
}

function formatPrice(price) {
  if (!price) return 'Precio no disponible';
  if (typeof price === 'object') {
    const amount = price.amount ?? (price.cents != null ? price.cents / 100 : '');
    const currency = price.currency ?? 'EUR';
    return `${amount} ${currency}`.trim();
  }
  return String(price);
}

function buildName(...parts) {
  const text = parts
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || 'Artículo sin nombre';
}

function formatLink(link) {
  if (!link) return 'https://es.vestiairecollective.com';
  if (link.startsWith('http')) return link;
  return `https://es.vestiairecollective.com${link}`;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

module.exports = { fetchListings, closeBrowser };
