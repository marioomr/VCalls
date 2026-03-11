require('dotenv').config();

const { checkForNewItems } = require('./services/monitor');
const { closeBrowser } = require('./scrapers/vestiaire');

// Variables obligatorias (SEARCH_URL ya no es necesaria)
const REQUIRED_ENV = ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'SEARCH_QUERY'];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Config] Error: la variable de entorno "${key}" no está definida en .env`);
    process.exit(1);
  }
}

const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 300_000;

console.log('==============================================');
console.log('  Vestiaire Collective Monitor - Iniciando');
console.log('==============================================');
console.log(`[Config] Búsqueda        : ${process.env.SEARCH_QUERY}`);
console.log(`[Config] Intervalo       : ${CHECK_INTERVAL / 1000}s`);
console.log('----------------------------------------------');

checkForNewItems();

setInterval(() => {
  checkForNewItems();
}, CHECK_INTERVAL);

async function shutdown() {
  console.log('\n[Bot] Cerrando navegador...');
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
