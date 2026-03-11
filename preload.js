'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Filters CRUD
  loadFilters:  ()     => ipcRenderer.invoke('filters:load'),
  addFilter:    (data) => ipcRenderer.invoke('filter:add', data),
  removeFilter: (id)   => ipcRenderer.invoke('filter:remove', id),

  // Monitor control (fire-and-forget)
  startFilter: (id) => ipcRenderer.send('filter:start', id),
  stopFilter:  (id) => ipcRenderer.send('filter:stop', id),

  // Open URL in system browser
  openLink: (url) => ipcRenderer.send('shell:open', url),

  // Events from main → renderer
  onStatus:  (cb) => ipcRenderer.on('filter:status',  (_, id, status)  => cb(id, status)),
  onProduct: (cb) => ipcRenderer.on('filter:product', (_, id, product) => cb(id, product)),
  onLog:     (cb) => ipcRenderer.on('app:log',        (_, msg)         => cb(msg)),
});
