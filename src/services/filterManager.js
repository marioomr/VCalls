'use strict';

/**
 * src/services/filterManager.js
 * ------------------------------
 * Manages one independent polling monitor per filter defined in filters.json.
 *
 * Each filter has:
 *   - name        : unique identifier used in logs and seen-items filename
 *   - platform    : "vestiaire" | "wallapop"
 *   - query       : search term
 *   - sort        : (vestiaire only) "recency" | "price_asc" | "price_desc"
 *   - interval    : poll interval in ms (default: CHECK_INTERVAL env or 5 min)
 *   - enabled     : false to skip at startup (default: true)
 *
 * Wallapop-specific optional fields:
 *   - latitude, longitude, distance, orderBy
 *
 * Seen-items for each filter are stored in:
 *   data/seen_<sanitized_name>.json
 */

const fs   = require('fs');
const path = require('path');

const { fetchListings: fetchVestiaire } = require('../scrapers/vestiaire');
const { fetchListings: fetchWallapop }  = require('../scrapers/wallapop');
const { sendAlert }                     = require('../bot/telegram');

const FILTERS_PATH = path.join(__dirname, '../../filters.json');
const DATA_DIR     = path.join(__dirname, '../../data');

// name -> { timer: NodeJS.Timeout, isFirstRun: boolean }
const _running = new Map();

// ---------------------------------------------------------------------------
// Seen-items helpers (one file per filter)
// ---------------------------------------------------------------------------

function seenPath(filterName) {
  const safe = filterName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  return path.join(DATA_DIR, `seen_${safe}.json`);
}

function loadSeen(filterName) {
  try {
    const p = seenPath(filterName);
    if (!fs.existsSync(p)) return new Set();
    return new Set(JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch {
    return new Set();
  }
}

function saveSeen(filterName, set) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(seenPath(filterName), JSON.stringify([...set], null, 2), 'utf-8');
  } catch (err) {
    console.error(`[${filterName}] Error guardando seen items:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Filters config
// ---------------------------------------------------------------------------

function loadFilters() {
  try {
    if (!fs.existsSync(FILTERS_PATH)) {
      console.warn('[FilterManager] filters.json no encontrado en la raíz del proyecto.');
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(FILTERS_PATH, 'utf-8'));
    if (!Array.isArray(raw)) {
      console.error('[FilterManager] filters.json debe ser un array JSON.');
      return [];
    }
    return raw.filter(f => f.enabled !== false);
  } catch (err) {
    console.error('[FilterManager] Error leyendo filters.json:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Single-filter tick (called by setInterval)
// ---------------------------------------------------------------------------

async function tick(filter) {
  const { name } = filter;
  const tag      = `[${name}]`;
  const platform = (filter.platform || 'vestiaire').toLowerCase();

  console.log(`${tag} Comprobando...`);

  let items = [];
  try {
    if (platform === 'wallapop') {
      items = await fetchWallapop({
        keywords:   filter.query,
        latitude:   filter.latitude   || parseFloat(process.env.WALLAPOP_LATITUDE)  || 40.4168,
        longitude:  filter.longitude  || parseFloat(process.env.WALLAPOP_LONGITUDE) || -3.7038,
        distance:   filter.distance   || parseInt(process.env.WALLAPOP_DISTANCE, 10) || 200,
        orderBy:    filter.orderBy    || 'newest',
        categoryId: filter.categoryId,
        priceMin:   filter.priceMin,
        priceMax:   filter.priceMax,
        condition:  filter.condition,
      });
    } else {
      items = await fetchVestiaire({
        query: filter.query,
        sort:  filter.sort || 'recency',
      });
    }
  } catch (err) {
    console.error(`${tag} Error en scraper:`, err.message);
    return;
  }

  if (items.length === 0) {
    console.warn(`${tag} Sin resultados.`);
    return;
  }

  // Guard: filter may have been stopped while scraping was in progress
  const state = _running.get(name);
  if (!state) return;

  const seenSet = loadSeen(name);

  // First run of this process: seed silently, no alerts
  if (state.isFirstRun) {
    state.isFirstRun = false;
    items.forEach(i => seenSet.add(i.id));
    saveSeen(name, seenSet);
    console.log(`${tag} Iniciado — ${items.length} artículo(s) marcado(s) como vistos. Monitorizando novedades...`);
    return;
  }

  const newItems = items.filter(i => !seenSet.has(i.id));

  if (newItems.length === 0) {
    console.log(`${tag} Sin novedades.`);
    return;
  }

  console.log(`${tag} ¡${newItems.length} artículo(s) nuevo(s)!`);

  const platformLabel = platform === 'wallapop' ? 'Wallapop' : 'Vestiaire';
  for (const item of newItems) {
    await sendAlert({ ...item, platform: platformLabel, filterName: name });
    seenSet.add(item.id);
  }

  saveSeen(name, seenSet);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts polling for a single filter object.
 * Does nothing if the filter is already running.
 */
function startFilter(filter) {
  const { name } = filter;

  if (_running.has(name)) {
    console.log(`[FilterManager] "${name}" ya está en ejecución.`);
    return;
  }

  if (!filter.query) {
    console.warn(`[FilterManager] Filtro "${name}" sin query — omitido.`);
    return;
  }

  const interval      = filter.interval || parseInt(process.env.CHECK_INTERVAL, 10) || 300_000;
  const platformLabel = (filter.platform || 'vestiaire').toUpperCase();
  const sortLabel     = filter.sort ? ` | sort: ${filter.sort}` : '';
  const extras = [
    filter.categoryId ? `cat=${filter.categoryId}` : null,
    filter.priceMin   ? `min=${filter.priceMin}€`  : null,
    filter.priceMax   ? `max=${filter.priceMax}€`  : null,
    filter.condition  ? `cond=${filter.condition}` : null,
  ].filter(Boolean).join(' ');

  console.log(`[FilterManager] ▶ "${name}" [${platformLabel}] q="${filter.query}"${sortLabel}${extras ? ' | ' + extras : ''} — cada ${interval / 1000}s`);

  const state = { isFirstRun: true, timer: null };
  _running.set(name, state);

  // Run immediately, then on every interval
  tick(filter);
  state.timer = setInterval(() => tick(filter), interval);
}

/**
 * Stops a running filter by name.
 */
function stopFilter(name) {
  const state = _running.get(name);
  if (!state) {
    console.log(`[FilterManager] "${name}" no está en ejecución.`);
    return;
  }
  clearInterval(state.timer);
  _running.delete(name);
  console.log(`[FilterManager] ⏹  "${name}" detenido.`);
}

/**
 * Reads filters.json and starts all enabled filters.
 */
function startAll() {
  const filters = loadFilters();
  if (filters.length === 0) {
    console.warn('[FilterManager] No hay filtros habilitados en filters.json.');
    console.warn('[FilterManager] Añade filtros con "enabled": true para empezar.');
    return;
  }
  console.log(`[FilterManager] Iniciando ${filters.length} filtro(s)...`);
  for (const f of filters) startFilter(f);
}

/**
 * Stops all running filters.
 */
function stopAll() {
  for (const name of [..._running.keys()]) stopFilter(name);
}

/**
 * Returns the names of currently running filters.
 */
function listRunning() {
  return [..._running.keys()];
}

module.exports = { startFilter, stopFilter, startAll, stopAll, listRunning, loadFilters };
