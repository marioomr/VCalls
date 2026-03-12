'use strict';

/**
 * src/utils/browser.js
 * --------------------
 * Singleton Puppeteer browser shared by all scrapers.
 *
 * Chrome path resolution order:
 *   1. CHROME_EXECUTABLE env var (set this in .env on every machine)
 *   2. Common Linux/Ubuntu paths  ← default for the production server
 *   3. macOS path                 ← fallback for local development
 *
 * Set CHROME_EXECUTABLE in .env to pin an exact path and skip the search.
 */

const puppeteer = require('puppeteer-core');
const fs        = require('fs');

// Candidate paths tried in order when CHROME_EXECUTABLE is not set.
const CHROME_CANDIDATES = [
  process.env.CHROME_EXECUTABLE,          // always first
  '/usr/bin/google-chrome-stable',        // Google Chrome on Ubuntu (stable channel)
  '/usr/bin/google-chrome',               // Google Chrome on Ubuntu (generic)
  '/usr/bin/chromium-browser',            // Chromium via apt on Ubuntu
  '/usr/bin/chromium',                    // Chromium on some distros
  '/snap/bin/chromium',                   // Chromium via snap
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS dev
  '/Applications/Chromium.app/Contents/MacOS/Chromium',           // macOS Chromium
].filter(Boolean); // drop undefined (when CHROME_EXECUTABLE is not set)

/**
 * Finds the first Chrome/Chromium binary that exists on disk.
 * Throws a descriptive error if none is found.
 */
function resolveChromePath() {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // existsSync can throw on EACCES – skip and continue
    }
  }
  throw new Error(
    'Chrome/Chromium binary not found.\n' +
    'Add CHROME_EXECUTABLE=/path/to/chrome to your .env file, ' +
    'or install Google Chrome / Chromium.\n' +
    'Paths checked:\n  ' + CHROME_CANDIDATES.join('\n  ')
  );
}

// Flags safe for both macOS development and headless Ubuntu servers.
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',   // prevents /dev/shm OOM on Linux containers
  '--disable-gpu',              // not needed in headless mode, avoids GPU errors
  '--disable-extensions',
  '--disable-default-apps',
  '--no-first-run',
];

let _browser  = null;
let _launching = null; // prevents concurrent launches

/**
 * Returns the shared browser instance, launching it if necessary.
 * Safe to call concurrently from multiple scrapers.
 */
async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;

  // If a launch is already in progress, wait for it instead of starting a second one.
  if (_launching) return _launching;

  _launching = (async () => {
    const executablePath = resolveChromePath();
    console.log(`[Browser] Iniciando Chrome: ${executablePath}`);
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,   // 'new' was deprecated in puppeteer v22; true is the correct flag
      args:     LAUNCH_ARGS,
    });

    // If Chrome crashes or the connection drops, clear the reference so the
    // next call to getBrowser() will launch a fresh instance.
    browser.on('disconnected', () => {
      console.warn('[Browser] Conexión perdida con Chrome. Se relanzará en el próximo ciclo.');
      _browser = null;
    });

    return browser;
  })().finally(() => {
    _launching = null;
  });

  _browser = await _launching;
  return _browser;
}

/**
 * Gracefully closes the shared browser.
 * Called on app shutdown (Electron before-quit, or process exit).
 */
async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

/**
 * Returns true when an error indicates the browser/page was forcibly closed
 * and the browser singleton should be reset before retrying.
 */
function isFatalBrowserError(err) {
  const msg = (err && err.message) || '';
  return (
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Connection closed') ||
    msg.includes('Protocol error') ||
    msg.includes('detached Frame') ||
    msg.includes('browser has disconnected')
  );
}

module.exports = { getBrowser, closeBrowser, isFatalBrowserError };
