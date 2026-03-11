'use strict';

const fs   = require('fs');
const path = require('path');

const { fetchListings } = require('../scrapers/wallapop');
const { sendAlert }     = require('../bot/telegram');

const STORAGE_PATH = path.join(__dirname, '../../data/seenItems_wallapop.json');

function loadSeen() {
  try {
    if (!fs.existsSync(STORAGE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSeen(ids) {
  try {
    const dir = path.dirname(STORAGE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(ids, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Wallapop Monitor] Error al guardar seen items:', err.message);
  }
}

let isFirstRun = loadSeen().length === 0;

async function checkForNewItems(options) {
  console.log('[Wallapop] Comprobando nuevos artículos...');

  const items = await fetchListings(options);

  if (items.length === 0) {
    console.warn('[Wallapop] No se encontraron artículos. Revisa la configuración.');
    return;
  }

  const seenIds = loadSeen();
  const seenSet = new Set(seenIds);

  if (isFirstRun) {
    isFirstRun = false;
    items.forEach((item) => seenSet.add(item.id));
    saveSeen([...seenSet]);
    console.log(`[Wallapop] Primera ejecución: ${items.length} artículos marcados como vistos. Esperando novedades...`);
    return;
  }

  const newItems = items.filter((item) => !seenSet.has(item.id));

  if (newItems.length === 0) {
    console.log('[Wallapop] Sin artículos nuevos.');
    return;
  }

  console.log(`[Wallapop] ${newItems.length} artículo(s) nuevo(s) encontrado(s).`);

  for (const item of newItems) {
    await sendAlert({ ...item, platform: 'Wallapop' });
    seenSet.add(item.id);
  }

  saveSeen([...seenSet]);
}

module.exports = { checkForNewItems };
