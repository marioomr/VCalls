/**
 * src/vestiaire.js
 * ----------------
 * Thin compatibility wrapper used by the Electron app (main.js).
 * All logic lives in src/scrapers/vestiaire.js — a single source of truth.
 *
 * main.js calls: fetchListings(query)  ← string
 * scrapers/vestiaire.js expects: fetchListings({ query, sort })  ← object
 * This wrapper normalises both call styles.
 */

'use strict';

const { fetchListings: _fetch, closeBrowser } = require('./scrapers/vestiaire');

/**
 * @param {string|{query?:string, sort?:string}} queryOrOpts
 */
function fetchListings(queryOrOpts) {
  const opts = typeof queryOrOpts === 'string'
    ? { query: queryOrOpts }
    : (queryOrOpts || {});
  return _fetch(opts);
}

module.exports = { fetchListings, closeBrowser };
