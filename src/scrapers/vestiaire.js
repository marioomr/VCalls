/**
 * vestiaire.js
 * ------------
 * Usa puppeteer-core + Chrome del sistema para abrir la página de búsqueda
 * de Vestiaire Collective y extraer los productos directamente del DOM.
 *
 * - Sin axios, sin cookies, sin API directa.
 * - Bloquea imágenes, fuentes y trackers para mayor velocidad.
 * - Browser singleton reutilizado entre ciclos.
 *
 * Variables de entorno:
 *   SEARCH_QUERY → Término de búsqueda
 *   SEARCH_SORT  → recency | price_asc | price_desc  (por defecto: recency)
 */

const puppeteer = require('puppeteer-core');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Mapa de valores de ordenación de la URL
const SORT_MAP = { recency: 3, price_asc: 1, price_desc: 2 };

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
      ],
    });
  }
  return _browser;
}

/**
 * Navega a la página de búsqueda y captura la respuesta de la API interna.
 *
 * @returns {Promise<Array<{id, name, price, link, image}>>}
 */
async function fetchListings() {
  const q = process.env.SEARCH_QUERY || 'balenciaga';
  const sortKey = process.env.SEARCH_SORT || 'recency';
  const sortNum = SORT_MAP[sortKey] ?? 3;
  const searchUrl = `https://es.vestiairecollective.com/search/?q=${encodeURIComponent(q)}&sortBy=${sortNum}`;

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
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Oculta la señal de automatización
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log(`[Vestiaire] Cargando: ${searchUrl}`);

    // Navegamos e interceptamos la respuesta de la API al mismo tiempo
    const [apiResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/v1/product/search') &&
          res.request().method() === 'POST' &&
          res.status() === 200,
        { timeout: 30000 }
      ),
      page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);

    const data = await apiResponse.json();
    const items = parseProducts(data);
    console.log(`[Vestiaire] ${items.length} artículos recibidos (q="${q}").`);
    return items;
  } catch (err) {
    console.error('[Vestiaire] Error durante el scraping:', err.message);
    // Reemplazar el navegador en el próximo ciclo
    try { await _browser.close(); } catch {}
    _browser = null;
    return [];
  } finally {
    try { await page.close(); } catch {}
  }
}

// ------------------------------------------------------------------
// Parseo de la respuesta JSON de la API
// ------------------------------------------------------------------

function parseProducts(data) {
  const raw =
    data?.items ||
    data?.products ||
    data?.data?.items ||
    data?.results ||
    [];

  if (!Array.isArray(raw)) {
    console.warn('[Vestiaire] Respuesta inesperada:', JSON.stringify(data).slice(0, 300));
    return [];
  }

  return raw
    .map((p) => ({
      id: String(p.id || p.itemId || ''),
      name:
        [p.brand?.name, p.name, p.model].filter(Boolean).join(' ') ||
        'Artículo sin nombre',
      price: formatPrice(p.price),
      link: formatLink(p.link),
      image:
        p.picture?.url ||
        (Array.isArray(p.picture) ? p.picture[0]?.url : null) ||
        p.imageUrl ||
        null,
    }))
    .filter((item) => item.id);
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function formatPrice(price) {
  if (!price) return 'Precio no disponible';
  if (typeof price === 'object') {
    const amount = price.amount ?? (price.cents != null ? price.cents / 100 : '');
    const currency = price.currency ?? '€';
    return `${amount} ${currency}`;
  }
  return String(price);
}

function formatLink(link) {
  if (!link) return 'https://es.vestiairecollective.com';
  if (link.startsWith('http')) return link;
  return `https://es.vestiairecollective.com${link}`;
}

async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

module.exports = { fetchListings, closeBrowser };
