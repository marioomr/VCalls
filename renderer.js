'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let filters      = [];
let productCount = 0;
let runningCount = 0;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  filters = await window.api.loadFilters();
  renderFilters();
  addLog('Sistema iniciado. Añade un filtro y pulsa ▶ Play para comenzar.');
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
  });
});

// ---------------------------------------------------------------------------
// Add filter
// ---------------------------------------------------------------------------

document.getElementById('btn-add').addEventListener('click', addFilterHandler);

['input-name', 'input-query'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') addFilterHandler();
  });
});

async function addFilterHandler() {
  const name     = document.getElementById('input-name').value.trim();
  const query    = document.getElementById('input-query').value.trim();
  const interval = parseInt(document.getElementById('input-interval').value, 10);

  if (!name || !query) {
    addLog('⚠️ Nombre y búsqueda son obligatorios.', 'warn');
    return;
  }

  filters = await window.api.addFilter({ name, query, interval });
  document.getElementById('input-name').value  = '';
  document.getElementById('input-query').value = '';
  renderFilters();
  addLog(`✅ Filtro añadido: "${name}" (q="${query}", cada ${interval / 1000}s)`);
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
    const card = document.createElement('div');
    card.className = 'filter-card';
    card.dataset.id = filter.id;
    card.innerHTML = `
      <div class="fc-top">
        <span class="fc-name" title="${esc(filter.name)}">${esc(filter.name)}</span>
        <div class="status-dot stopped" id="dot-${filter.id}"></div>
      </div>
      <span class="fc-query" title="${esc(filter.query)}">${esc(filter.query)}</span>
      <div class="fc-interval">Intervalo: ${filter.interval / 1000}s</div>
      <div class="fc-controls">
        <button class="btn btn-play"   data-action="start"  data-id="${filter.id}">▶ Play</button>
        <button class="btn btn-stop"   data-action="stop"   data-id="${filter.id}">⏹ Stop</button>
        <button class="btn btn-delete" data-action="delete" data-id="${filter.id}">🗑</button>
      </div>
    `;
    list.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Events from main process
// ---------------------------------------------------------------------------

window.api.onStatus((id, status) => {
  // Update dot
  const dot  = document.getElementById('dot-' + id);
  if (dot) dot.className = 'status-dot ' + status;

  // Update card class
  const card = document.querySelector(`.filter-card[data-id="${id}"]`);
  if (card) card.classList.toggle('running', status === 'running');

  // Update running counter
  if (status === 'running') {
    runningCount++;
  } else {
    runningCount = Math.max(0, runningCount - 1);
  }
  document.getElementById('stat-running').textContent = runningCount;
});

window.api.onProduct((id, product) => {
  addProduct(product);

  // Flash "Productos" tab badge
  const badge = document.getElementById('badge-products');
  badge.style.display = '';
  badge.textContent   = productCount;
});

window.api.onLog(msg => addLog(msg));

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function addProduct(product) {
  productCount++;
  document.getElementById('stat-products').textContent = productCount;

  const panel = document.getElementById('panel-products');
  const empty = document.getElementById('empty-products');
  if (empty) empty.style.display = 'none';

  const time = new Date().toLocaleTimeString('es-ES');
  const card = document.createElement('div');
  card.className = 'product-card';
  card.innerHTML = `
    <div class="product-info">
      <div class="product-name" title="${esc(product.name || '')}">${esc(product.name || 'Sin nombre')}</div>
      <div class="product-meta">
        ${product.price      ? `<span class="product-price">${esc(product.price)}</span>` : ''}
        ${product.filterName ? `<span class="product-filter-badge">${esc(product.filterName)}</span>` : ''}
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
// Logs
// ---------------------------------------------------------------------------

function addLog(msg, level) {
  const panel = document.getElementById('log-panel');
  const time  = new Date().toLocaleTimeString('es-ES');

  // Auto-detect level from message content
  let cls = level || 'info';
  if (!level) {
    if (msg.includes('Error') || msg.includes('error')) cls = 'error';
    else if (msg.includes('⚠️') || msg.includes('Sin'))  cls = 'warn';
    else if (msg.includes('✅') || msg.includes('nuevo')) cls = 'success';
  }

  const entry = document.createElement('div');
  entry.className = 'log-entry ' + cls;
  entry.textContent = `[${time}]  ${msg}`;
  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
}

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
