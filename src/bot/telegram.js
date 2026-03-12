/**
 * telegram.js
 * ------------
 * Envía mensajes a Telegram usando https nativo de Node.js.
 * Sin dependencias externas.
 */

const https = require('https');

async function sendAlert(item) {
  const token  = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('[Telegram] TELEGRAM_TOKEN o TELEGRAM_CHAT_ID no definidos.');
    return;
  }

  const platform = item.platform || 'Vestiaire';
  const emoji     = platform === 'Wallapop' ? '\uD83D\uDFE2' : '\uD83D\uDD25';
  const filterLine = item.filterName ? `Filtro: ${item.filterName}\n` : '';

  const text = [
    emoji + ' Nuevo artículo en ' + platform,
    '',
    filterLine + 'Nombre: ' + (item.name || 'Sin nombre'),
    'Precio: ' + (item.price || 'N/D'),
    '',
    item.link || '',
  ].join('\n');

  const body = JSON.stringify({ chat_id: chatId, text });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: '/bot' + token + '/sendMessage',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.error('[Telegram] Error HTTP ' + res.statusCode + ':', data);
          } else {
            console.log('[Telegram] Alerta enviada: ' + item.name);
          }
          resolve();
        });
      }
    );
    req.on('error', (err) => {
      console.error('[Telegram] Error de red:', err.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

module.exports = { sendAlert };
