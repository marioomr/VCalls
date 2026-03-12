'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let filters      = [];
let productCount = 0;
let runningCount = 0;

const filterStartTimes = new Map();
let uptimeTicker       = null;

const platformStats = {
  vestiaire: { total: 0, activeFilters: 0 },
  wallapop:  { total: 0, activeFilters: 0 },
};

const detectionHistory = { vestiaire: [], wallapop: [] };

const runningFilterIds = new Set();
const recentProducts   = [];
const MAX_RECENT       = 8;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  filters = await window.api.loadFilters();
  renderFilters();
  initCharts();
  addLog('VCalls iniciado. Añade un filtro y pulsa ▶ Play.');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'stats') {
      resizeCanvas('chart-vestiaire');
      resizeCanvas('chart-wallapop');
      drawSparkline('vestiaire');
      drawSparkline('wallapop');
    }
  });
});

// ---------------------------------------------------------------------------
// Platform selector buttons
// ---------------------------------------------------------------------------

document.querySelectorAll('.btn-platform').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-platform').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('input-platform').value = btn.dataset.platform;
  });
});

// ---------------------------------------------------------------------------
// Add filter
// ---------------------------------------------------------------------------

document.getElementById('btn-add').addEventListener('click', addFilterHandler);

['input-name', 'input-query'].forEach(inputId => {
  document.getElementById(inputId).addEventListener('keydown', e => {
    if (e.key === 'Enter') addFilterHandler();
  });
});

async function addFilterHandler() {
  const name     = document.getElementById('input-name').value.trim();
  const query    = document.getElementById('input-query').value.trim();
  const interval = parseInt(document.getElementById('input-interval').value, 10);
  const platform = document.getElementById('input-platform').value || 'vestiaire';

  if (!name || !query) {
    addLog('⚠️ Nombre y búsqueda son obligatorios.', 'warn');
    return;
  }

  filters = await window.api.addFilter({ name, query, interval, platform });
  document.getElementById('input-name').value  = '';
  document.getElementById('input-query').value = '';
  renderFilters();
  const label = platform === 'wallapop' ? 'Wallapop' : 'Vestiaire';
  addLog(`✅ Filtro añadido: "${name}" [${label}] — cada ${interval / 1000}s`);
}

// ---------------------------------------------------------------------------
// Filter list – event delegation
// ---------------------------------------------------------------------------

document.getElementById('filter-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id } = btn.dataset;

  if (action === 'start') {
    window.api.startFilter(id);
  } else if (action === 'stop') {
    window.api.stopFilter(id);
  } else if (action === 'delete') {
    const filter = filters.find(f => f.id === id);
    if (!confirm(`¿Eliminar el filtro "${filter?.name}"?\nSe borrarán sus datos de seguimiento.`)) return;
    filters = await window.api.removeFilter(id);
    renderFilters();
    addLog(`🗑️ Filtro eliminado: "${filter?.name}"`);
  }
});

// ---------------------------------------------------------------------------
// Render filters
// ---------------------------------------------------------------------------

function renderFilters() {
  const list  = document.getElementById('filter-list');
  const empty = document.getElementById('empty-filters');

  list.querySelectorAll('.filter-card').forEach(c => c.remove());

  if (filters.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  for (const filter of filters) {
    const isWp     = filter.platform === 'wallapop';
    const dotColor = isWp ? 'var(--wp)' : 'var(--vc)';
    const card     = document.createElement('div');
    card.className  = `filter-card ${isWp ? 'wp' : 'vc'}`;
    card.dataset.id = filter.id;
    card.innerHTML  = `
      <div class="fc-top">
        <div class="fc-left">
          <span class="fc-pdot" style="background:${dotColor}"></span>
          <span class="fc-name" title="${esc(filter.name)}">${esc(filter.name)}</span>
        </div>
        <div class="status-dot stopped" id="dot-${filter.id}"></div>
      </div>
      <span class="fc-query" title="${esc(filter.query)}">${esc(filter.query)}</span>
      <div class="fc-meta">
        <span class="fc-interval">cada ${filter.interval / 1000}s</span>
      </div>
      <div class="fc-controls">
        <button class="btn btn-play"   data-action="start"  data-id="${filter.id}">▶ Play</button>
        <button class="btn btn-stop"   data-action="stop"   data-id="${filter.id}">⏹ Stop</button>
        <button class="btn btn-delete" data-action="delete" data-id="${filter.id}">🗑</button>
      </div>
    `;
    if (runningFilterIds.has(filter.id)) {
      card.classList.add('running');
      const dot = card.querySelector('.status-dot');
      if (dot) dot.className = 'status-dot running';
    }
    list.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Events from main process
// ---------------------------------------------------------------------------

window.api.onStatus((id, status) => {
  const dot  = document.getElementById('dot-' + id);
  if (dot) dot.className = 'status-dot ' + status;

  const card = document.querySelector(`.filter-card[data-id="${id}"]`);
  if (card) card.classList.toggle('running', status === 'running');

  const filter   = filters.find(f => f.id === id);
  const platform = filter?.platform === 'wallapop' ? 'wallapop' : 'vestiaire';

  if (status === 'running') {
    runningFilterIds.add(id);
    runningCount++;
    platformStats[platform].activeFilters++;
    if (!filterStartTimes.has(id)) filterStartTimes.set(id, Date.now());
    if (!uptimeTicker) uptimeTicker = setInterval(updateUptime, 1000);
  } else {
    runningFilterIds.delete(id);
    runningCount = Math.max(0, runningCount - 1);
    platformStats[platform].activeFilters = Math.max(0, platformStats[platform].activeFilters - 1);
    filterStartTimes.delete(id);
    if (filterStartTimes.size === 0) {
      clearInterval(uptimeTicker);
      uptimeTicker = null;
      document.getElementById('stat-uptime').textContent = '--';
    }
  }

  document.getElementById('stat-running').textContent = runningCount;
  updatePlatformStats();
});

function updateUptime() {
  if (filterStartTimes.size === 0) return;
  const maxMs    = Math.max(...[...filterStartTimes.values()].map(t => Date.now() - t));
  const totalSec = Math.floor(maxMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  document.getElementById('stat-uptime').textContent = h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

window.api.onProduct((id, product) => {
  addProduct(product);
  const badge = document.getElementById('badge-products');
  badge.style.display = '';
  badge.textContent   = productCount;
});

window.api.onLog(msg => addLog(msg));

// ---------------------------------------------------------------------------
// Platform stats
// ---------------------------------------------------------------------------

function updatePlatformStats() {
  document.getElementById('vc-active-filters').textContent = platformStats.vestiaire.activeFilters;
  document.getElementById('wp-active-filters').textContent = platformStats.wallapop.activeFilters;
  const vcLed = document.querySelector('.pc-led.vc');
  const wpLed = document.querySelector('.pc-led.wp');
  if (vcLed) vcLed.classList.toggle('pulsing', platformStats.vestiaire.activeFilters > 0);
  if (wpLed) wpLed.classList.toggle('pulsing', platformStats.wallapop.activeFilters > 0);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function addProduct(product) {
  productCount++;
  document.getElementById('stat-products').textContent = productCount;

  const platform = (product.platform || '').toLowerCase() === 'wallapop' ? 'wallapop' : 'vestiaire';
  platformStats[platform].total++;

  const prefix   = platform === 'wallapop' ? 'wp' : 'vc';
  document.getElementById(`${prefix}-total`).textContent = platformStats[platform].total;
  document.getElementById(`${prefix}-last`).textContent  = new Date().toLocaleTimeString('es-ES');

  detectionHistory[platform].push(Date.now());
  drawSparkline(platform);

  recentProducts.unshift({ ...product, platform });
  if (recentProducts.length > MAX_RECENT) recentProducts.length = MAX_RECENT;
  updateRecentProducts();

  const panel = document.getElementById('panel-products');
  const empty = document.getElementById('empty-products');
  if (empty) empty.style.display = 'none';

  const isWp = platform === 'wallapop';
  const time = new Date().toLocaleTimeString('es-ES');
  const card = document.createElement('div');
  card.className = `product-card ${isWp ? 'wp' : 'vc'}`;

  // Thumbnail
  if (product.image) {
    const thumb = document.createElement('img');
    thumb.className = 'product-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.src = product.image;
    thumb.addEventListener('error', () => thumb.remove());
    card.appendChild(thumb);
  }

  card.innerHTML += `
    <div class="product-info">
      <div class="product-name" title="${esc(product.name || '')}">${esc(product.name || 'Sin nombre')}</div>
      <div class="product-meta">
        ${product.price      ? `<span class="product-price">${esc(product.price)}</span>` : ''}
        <span class="product-tag ${isWp ? 'wp' : 'vc'}">${isWp ? 'Wallapop' : 'Vestiaire'}</span>
        ${product.filterName ? `<span class="product-tag filter">${esc(product.filterName)}</span>` : ''}
        <span class="product-time">${time}</span>
      </div>
    </div>
    ${product.link ? `<button class="btn-link" data-url="${esc(product.link)}">Ver →</button>` : ''}
  `;
  panel.insertBefore(card, panel.firstChild);
}

document.getElementById('panel-products').addEventListener('click', e => {
  const btn = e.target.closest('[data-url]');
  if (btn) window.api.openLink(btn.dataset.url);
});

// ---------------------------------------------------------------------------
// Recent products grid (in stats panel)
// ---------------------------------------------------------------------------

function updateRecentProducts() {
  const grid = document.getElementById('recent-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (recentProducts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-grid-empty';
    empty.textContent = 'Los productos detectados aparecerán aquí';
    grid.appendChild(empty);
    return;
  }

  for (const product of recentProducts) {
    const isWp = product.platform === 'wallapop';
    const item = document.createElement('div');
    item.className = `recent-item ${isWp ? 'wp' : 'vc'}`;
    if (product.link) item.dataset.url = product.link;
    item.addEventListener('click', () => {
      if (item.dataset.url) window.api.openLink(item.dataset.url);
    });

    if (product.image) {
      const img = document.createElement('img');
      img.className = 'recent-item-img';
      img.src = product.image;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        const ph = document.createElement('div');
        ph.className = 'recent-item-placeholder';
        ph.textContent = isWp ? '🏷️' : '👗';
        img.replaceWith(ph);
      });
      item.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'recent-item-placeholder';
      ph.textContent = isWp ? '🏷️' : '👗';
      item.appendChild(ph);
    }

    const body = document.createElement('div');
    body.className = 'recent-item-body';
    const priceHtml = product.price
      ? `<div class="recent-item-price">${esc(product.price)}</div>` : '';
    body.innerHTML = `
      <div class="recent-item-name" title="${esc(product.name || '')}">${esc(product.name || 'Sin nombre')}</div>
      ${priceHtml}
      <span class="recent-item-tag ${isWp ? 'wp' : 'vc'}">${isWp ? 'Wallapop' : 'Vestiaire'}</span>
    `;
    item.appendChild(body);
    grid.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function initCharts() {
  resizeCanvas('chart-vestiaire');
  resizeCanvas('chart-wallapop');
  drawSparkline('vestiaire');
  drawSparkline('wallapop');
}

function resizeCanvas(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const w = canvas.parentElement.clientWidth - 24;
  if (w > 0) canvas.width = w;
}

function drawSparkline(platform) {
  const id     = platform === 'wallapop' ? 'chart-wallapop' : 'chart-vestiaire';
  const canvas = document.getElementById(id);
  if (!canvas || canvas.width === 0) return;

  const ctx   = canvas.getContext('2d');
  const W     = canvas.width;
  const H     = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const BUCKETS  = 15;
  const bucketMs = 60 * 1000;
  const now      = Date.now();
  const cutoff   = now - BUCKETS * bucketMs;

  detectionHistory[platform] = detectionHistory[platform].filter(t => t > cutoff);

  const counts = new Array(BUCKETS).fill(0);
  detectionHistory[platform].forEach(t => {
    const bucket = Math.floor((now - t) / bucketMs);
    if (bucket < BUCKETS) counts[BUCKETS - 1 - bucket]++;
  });

  const maxCount = Math.max(...counts, 1);
  const barW     = W / BUCKETS;
  const color    = platform === 'wallapop' ? '#06b6d4' : '#f97316';

  counts.forEach((c, i) => {
    if (c === 0) {
      ctx.fillStyle  = 'rgba(255,255,255,0.03)';
      ctx.globalAlpha = 1;
      ctx.fillRect(i * barW + 1, 0, barW - 2, H);
      return;
    }
    const barH  = Math.max(4, (c / maxCount) * (H - 2));
    ctx.globalAlpha = 0.35 + (i / BUCKETS) * 0.65;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.roundRect(i * barW + 1, H - barH, barW - 2, barH, 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

window.addEventListener('resize', () => {
  resizeCanvas('chart-vestiaire');
  resizeCanvas('chart-wallapop');
  drawSparkline('vestiaire');
  drawSparkline('wallapop');
});

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

function addLog(msg, level) {
  const panel = document.getElementById('log-panel');
  const time  = new Date().toLocaleTimeString('es-ES');

  let cls = level || 'info';
  if (!level) {
    if (/error/i.test(msg))                               cls = 'error';
    else if (msg.includes('⚠️') || /sin\s/i.test(msg))   cls = 'warn';
    else if (msg.includes('✅') || /nuevo/i.test(msg))    cls = 'success';
  }

  const entry = document.createElement('div');
  entry.className = 'log-entry ' + cls;
  entry.innerHTML = `<span class="lt">[${time}]</span>  ${esc(msg || '')}`;
  panel.appendChild(entry);

  const tabPanel = document.getElementById('panel-logs');
  tabPanel.scrollTop = tabPanel.scrollHeight;
}

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  document.getElementById('log-panel').innerHTML = '';
  addLog('Logs limpiados.');
});

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

init();
