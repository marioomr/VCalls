/**
 * src/telegram.js
 * ---------------
 * Envía alertas a Telegram usando https nativo de Node.js.
 * Sin dependencias externas.
 */

'use strict';

const https = require('https');

/**
 * @param {Object} item
 * @param {string} item.name
 * @param {string} item.price
 * @param {string} item.link
 * @param {string} [item.filterName]
 */
async function sendAlert(item) {
  const token  = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;

  if (!token || !chatId) {
    console.error('[Telegram] TELEGRAM_TOKEN o TELEGRAM_CHAT_ID no definidos.');
    return;
  }

  const platform = item.platform || 'Vestiaire';
  const emoji     = platform === 'Wallapop' ? '🟢' : '🔥';

  const lines = [
    `${emoji} Nuevo artículo en ${platform}`,
    '',
  ];
  if (item.filterName) lines.push(`Filtro: ${item.filterName}`);
  lines.push(`Nombre: ${item.name || 'Sin nombre'}`);
  lines.push(`Precio: ${item.price || 'N/D'}`);
  lines.push('');
  lines.push(item.link || '');

  const text = lines.join('\n');
  const body = JSON.stringify({ chat_id: chatId, text });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     '/bot' + token + '/sendMessage',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
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
    req.on('error', err => {
      console.error('[Telegram] Error de red:', err.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

module.exports = { sendAlert };
