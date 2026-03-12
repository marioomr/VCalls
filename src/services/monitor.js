const { fetchListings } = require('../scrapers/vestiaire');
const { sendAlert } = require('../bot/telegram');
const { loadSeenItems, saveSeenItems } = require('../utils/storage');

// true during the first check of every process start, regardless of saved state.
// This ensures we never alert for items that were already on the site when the bot launched.
let isFirstRun = true;

async function checkForNewItems() {
  console.log('[Monitor] Comprobando nuevos artículos...');

  const currentItems = await fetchListings();

  if (currentItems.length === 0) {
    console.warn('[Monitor] No se encontraron artículos. Revisa el scraper.');
    return;
  }

  const seenIds = loadSeenItems();
  const seenSet = new Set(seenIds);

  // En la primera ejecución, marcar todo como visto sin enviar alertas
  if (isFirstRun) {
    isFirstRun = false;
    currentItems.forEach((item) => seenSet.add(item.id));
    saveSeenItems([...seenSet]);
    console.log(`[Monitor] Primera ejecución: ${currentItems.length} artículos marcados como vistos. Esperando novedades...`);
    return;
  }

  const newItems = currentItems.filter((item) => !seenSet.has(item.id));

  if (newItems.length === 0) {
    console.log('[Monitor] Sin artículos nuevos.');
    return;
  }

  console.log(`[Monitor] ${newItems.length} artículo(s) nuevo(s) encontrado(s).`);

  for (const item of newItems) {
    await sendAlert(item);
    seenSet.add(item.id);
  }

  saveSeenItems([...seenSet]);
}

module.exports = { checkForNewItems };
