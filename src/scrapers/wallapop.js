'use strict';

const puppeteer = require('puppeteer-core');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const BLOCKED_TYPES   = new Set(['image', 'font', 'media']);
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'hotjar.com', 'segment.com', 'amplitude.com',
];

const DEFAULT_LATITUDE  = 40.4168;
const DEFAULT_LONGITUDE = -3.7038;
const DEFAULT_DISTANCE  = 200000;

let _browser = null;

async function getBrowser() {
  if (!_browser || !_browser.isConnected()) {
    _browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless:       'new',
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
    _browser = null;
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
    try { await _browser.close(); } catch {}
    _browser = null;
    return [];
  } finally {
    try { await page.close(); } catch {}
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
        return { id, name, price, link, image: null };
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
      const image  = Array.isArray(images) && images.length > 0
        ? (images[0]?.urls?.big || images[0]?.urls?.medium || images[0]?.original || null)
        : null;

      return { id, name: title, price, link, image };
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

async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

module.exports = { fetchListings, closeBrowser };
