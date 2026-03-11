'use strict';

require('dotenv').config();

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

const { fetchListings, closeBrowser } = require('./src/vestiaire');
const { sendAlert }                   = require('./src/telegram');

// ---------------------------------------------------------------------------
// Filters persistence
// ---------------------------------------------------------------------------

const FILTERS_PATH = path.join(__dirname, 'filters.json');

function loadFilters() {
  try {
    if (!fs.existsSync(FILTERS_PATH)) return [];
    return JSON.parse(fs.readFileSync(FILTERS_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveFilters(filters) {
  fs.writeFileSync(FILTERS_PATH, JSON.stringify(filters, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1100,
    height:   720,
    minWidth: 800,
    minHeight: 560,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    backgroundColor: '#111318',
  });

  mainWindow.loadFile('index.html');

  // Open all target="_blank" links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  stopAllFilters();
  await closeBrowser();
});

// ---------------------------------------------------------------------------
// Monitor state
// ---------------------------------------------------------------------------

const activeIntervals  = new Map();  // filterId → NodeJS.Timeout
const seededInSession  = new Set();  // filterId → already seeded this session

function log(msg) {
  console.log(msg);
  if (mainWindow) mainWindow.webContents.send('app:log', msg);
}

function startFilter(id) {
  if (activeIntervals.has(id)) return;

  const filterData = loadFilters().find(f => f.id === id);
  if (!filterData) return;

  log(`[Monitor] Iniciando "${filterData.name}" (q="${filterData.query}")`);
  if (mainWindow) mainWindow.webContents.send('filter:status', id, 'running');

  const tick = async () => {
    const filters = loadFilters();
    const filter  = filters.find(f => f.id === id);
    if (!filter) { stopFilter(id); return; }

    log(`[${filter.name}] Comprobando...`);
    const items = await fetchListings(filter.query);

    if (items.length === 0) {
      log(`[${filter.name}] Sin resultados`);
      return;
    }

    const seenSet = new Set(filter.seenIds || []);

    // First-time seed: mark all current items as seen without alerting
    if (seenSet.size === 0 && !seededInSession.has(id)) {
      seededInSession.add(id);
      items.forEach(item => seenSet.add(item.id));
      filter.seenIds = [...seenSet];
      saveFilters(filters);
      log(`[${filter.name}] ${items.length} artículos marcados como vistos. Monitorizando novedades...`);
      return;
    }

    const newItems = items.filter(item => !seenSet.has(item.id));

    if (newItems.length === 0) {
      log(`[${filter.name}] Sin novedades`);
      return;
    }

    log(`[${filter.name}] ¡${newItems.length} artículo(s) nuevo(s)!`);

    for (const item of newItems) {
      seenSet.add(item.id);
      await sendAlert({ ...item, filterName: filter.name });
      if (mainWindow) {
        mainWindow.webContents.send('filter:product', id, { ...item, filterName: filter.name });
      }
    }

    filter.seenIds = [...seenSet];
    saveFilters(filters);
  };

  tick();
  activeIntervals.set(id, setInterval(tick, filterData.interval || 30000));
}

function stopFilter(id) {
  if (!activeIntervals.has(id)) return;
  clearInterval(activeIntervals.get(id));
  activeIntervals.delete(id);
  const filter = loadFilters().find(f => f.id === id);
  log(`[Monitor] Detenido: "${filter?.name || id}"`);
  if (mainWindow) mainWindow.webContents.send('filter:status', id, 'stopped');
}

function stopAllFilters() {
  for (const id of [...activeIntervals.keys()]) stopFilter(id);
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('filters:load', () => loadFilters());

ipcMain.handle('filter:add', (_, { name, query, interval }) => {
  const filters = loadFilters();
  filters.push({
    id:       Date.now().toString(),
    name:     name.trim(),
    query:    query.trim(),
    interval: Number(interval) || 30000,
    seenIds:  [],
  });
  saveFilters(filters);
  return filters;
});

ipcMain.handle('filter:remove', (_, id) => {
  stopFilter(id);
  seededInSession.delete(id);
  const filters = loadFilters().filter(f => f.id !== id);
  saveFilters(filters);
  return filters;
});

ipcMain.on('filter:start', (_, id) => startFilter(id));
ipcMain.on('filter:stop',  (_, id) => stopFilter(id));

ipcMain.on('shell:open', (_, url) => {
  // Only allow http/https to prevent protocol injection
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});
