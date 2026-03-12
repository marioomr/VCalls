require('dotenv').config();

const { startAll, stopAll } = require('./services/filterManager');
const { closeBrowser }      = require('./utils/browser');

const REQUIRED_ENV = ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Config] Error: la variable de entorno "${key}" no está definida en .env`);
    process.exit(1);
  }
}

console.log('==============================================');
console.log('  Monitor Multi-Plataforma - Iniciando');
console.log('==============================================');
console.log('[Config] Leyendo filtros desde filters.json...');

startAll();

console.log('----------------------------------------------');

async function shutdown() {
  console.log('\n[Bot] Apagando monitores...');
  stopAll();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
