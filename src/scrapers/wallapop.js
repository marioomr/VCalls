'use strict';

const { getBrowser, closeBrowser, isFatalBrowserError } = require('../utils/browser');

const BLOCKED_TYPES   = new Set(['image', 'font', 'media']);
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'hotjar.com', 'segment.com', 'amplitude.com',
];

const DEFAULT_LATITUDE  = 40.4168;
const DEFAULT_LONGITUDE = -3.7038;
const DEFAULT_DISTANCE  = 200000;

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

  const searchUrl =
    `https://es.wallapop.com/app/search?keywords=${encodeURIComponent(keywords)}` +
    `&order_by=${orderBy}&distance=${distance}&latitude=${latitude}&longitude=${longitude}`;

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
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

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

    console.log(`[Wallapop] Cargando: ${searchUrl}`);

    const apiResponsePromise = page.waitForResponse(
      res =>
        res.url().includes('api.wallapop.com') &&
        res.url().includes('/search') &&
        res.status() >= 200 &&
        res.status() < 300,
      { timeout: 35000 }
    ).catch(() => null);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    const apiResponse = await apiResponsePromise;
    if (apiResponse) {
      try {
        const data  = await apiResponse.json();
        const items = parseItems(data);
        if (items.length > 0) {
          console.log(`[Wallapop] ${items.length} artículos recibidos (q="${keywords}").`);
          return items;
        }
      } catch {
        // fall through to DOM extraction
      }
    }

    console.warn('[Wallapop] Sin respuesta de API, intentando extracción del DOM...');
    const domItems = await extractFromDOM(page, keywords);
    console.log(`[Wallapop] ${domItems.length} artículos del DOM (q="${keywords}").`);
    return domItems;

  } catch (err) {
    console.error('[Wallapop] Error de scraping:', err.message);
    if (isFatalBrowserError(err)) {
      // closeBrowser resets the singleton so the next cycle relaunches cleanly
      await closeBrowser();
    }
    return [];
  } finally {
    try { if (!page.isClosed()) await page.close(); } catch {}
  }
}

async function extractFromDOM(page, keywords) {
  try {
    const CARD_SEL =
      '[class*="ItemCard"], [class*="item-card"], ' +
      '[data-testid*="item"], article[class*="item"]';

    await page.waitForSelector(CARD_SEL, { timeout: 10000 }).catch(() => {});

    return await page.$$eval(CARD_SEL, (cards) =>
      cards.map(card => {
        const anchor  = card.querySelector('a[href]');
        const href    = anchor?.getAttribute('href') || '';
        const link    = href.startsWith('http')
          ? href
          : href ? `https://es.wallapop.com${href}` : 'https://es.wallapop.com';
        const id      = href.split('/').pop()?.split('?')[0] || '';
        const nameEl  = card.querySelector('[class*="title"], [class*="name"], h2, h3');
        const name    = (nameEl?.innerText || anchor?.innerText || '').trim().split('\n')[0];
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        const price   = (priceEl?.innerText || '').trim();
        const imgEl = card.querySelector('img[src], img[data-src]');
        const image = normalizeImageUrl(imgEl?.getAttribute('src') || imgEl?.dataset?.src || null);
        return { id, name, price, link, image };
      }).filter(i => i.id)
    );
  } catch {
    return [];
  }
}

function parseItems(data) {
  const raw =
    data?.data?.section?.payload?.items ||
    data?.search_objects ||
    data?.data?.items    ||
    data?.items          ||
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

      const price  = formatPrice(content?.price);
      const images = content?.images || [];
      const rawImage = Array.isArray(images) && images.length > 0
        ? (images[0]?.urls?.big || images[0]?.urls?.medium || images[0]?.urls?.small || images[0]?.original || null)
        : null;
      const image = normalizeImageUrl(rawImage);

      return { id, name: title, price, link, image };
    })
    .filter(Boolean);
}

function normalizeImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/'))  return `https://api.wallapop.com${url}`;
  return url;
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

// Re-export closeBrowser from the shared utility so main.js can call it
// without knowing which module manages the singleton.
module.exports = { fetchListings, closeBrowser };
