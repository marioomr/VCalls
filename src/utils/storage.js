/**
 * storage.js
 * ------------
 * Utilidad para leer y escribir el archivo seenItems.json.
 * Almacena los IDs de los artículos ya vistos para evitar duplicados.
 */

const fs = require('fs');
const path = require('path');

const STORAGE_PATH = path.join(__dirname, '../../data/seenItems.json');

/**
 * Carga los artículos ya vistos desde el archivo JSON.
 * Si el archivo no existe, devuelve un array vacío.
 * @returns {string[]} Array de IDs de artículos vistos
 */
function loadSeenItems() {
  try {
    if (!fs.existsSync(STORAGE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Storage] Error al leer seenItems.json:', err.message);
    return [];
  }
}

/**
 * Guarda el array de IDs vistos en el archivo JSON.
 * @param {string[]} items - Array de IDs a persistir
 */
function saveSeenItems(items) {
  try {
    const dir = path.dirname(STORAGE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Storage] Error al guardar seenItems.json:', err.message);
  }
}

module.exports = { loadSeenItems, saveSeenItems };
