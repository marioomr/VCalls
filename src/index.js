require('dotenv').config();

const { checkForNewItems: checkVestiaire }                         = require('./services/monitor');
const { checkForNewItems: checkWallapop }                          = require('./services/wallapopMonitor');
const { closeBrowser: closeVestiaireBrowser }                      = require('./scrapers/vestiaire');
const { closeBrowser: closeWallapopBrowser }                       = require('./scrapers/wallapop');

const REQUIRED_ENV = ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Config] Error: la variable de entorno "${key}" no está definida en .env`);
    process.exit(1);
  }
}

const CHECK_INTERVAL           = parseInt(process.env.CHECK_INTERVAL, 10)            || 300_000;
const WALLAPOP_CHECK_INTERVAL  = parseInt(process.env.WALLAPOP_CHECK_INTERVAL, 10)   || CHECK_INTERVAL;

const vestiaireQuery  = process.env.SEARCH_QUERY;
const wallapopQuery   = process.env.WALLAPOP_QUERY;

const wallapopOptions = {
  keywords:  wallapopQuery,
  latitude:  parseFloat(process.env.WALLAPOP_LATITUDE)  || 40.4168,
  longitude: parseFloat(process.env.WALLAPOP_LONGITUDE) || -3.7038,
  distance:  parseInt(process.env.WALLAPOP_DISTANCE, 10) || 200000,
};

console.log('==============================================');
console.log('  Monitor Multi-Plataforma - Iniciando');
console.log('==============================================');

let vestiaireInterval = null;
let wallapopInterval  = null;

if (vestiaireQuery) {
  console.log(`[Vestiaire] Búsqueda: ${vestiaireQuery} | Intervalo: ${CHECK_INTERVAL / 1000}s`);
  checkVestiaire();
  vestiaireInterval = setInterval(() => checkVestiaire(), CHECK_INTERVAL);
} else {
  console.log('[Vestiaire] SEARCH_QUERY no definida — sección desactivada.');
}

if (wallapopQuery) {
  console.log(`[Wallapop] Búsqueda: ${wallapopQuery} | Intervalo: ${WALLAPOP_CHECK_INTERVAL / 1000}s`);
  checkWallapop(wallapopOptions);
  wallapopInterval = setInterval(() => checkWallapop(wallapopOptions), WALLAPOP_CHECK_INTERVAL);
} else {
  console.log('[Wallapop] WALLAPOP_QUERY no definida — sección desactivada.');
}

console.log('----------------------------------------------');

async function shutdown() {
  console.log('\n[Bot] Apagando monitores...');
  if (vestiaireInterval) clearInterval(vestiaireInterval);
  if (wallapopInterval)  clearInterval(wallapopInterval);
  await closeVestiaireBrowser();
  await closeWallapopBrowser();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
