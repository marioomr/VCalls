import atexit
import logging
from typing import Any, Dict, List, Optional

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright

logger = logging.getLogger(__name__)

WALLAPOP_HOME_URL = "https://es.wallapop.com"


class WallapopBrowserSession:
    def __init__(self, initial_cookies: Optional[List[Dict[str, Any]]] = None) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._headers: Dict[str, str] = {}
        self._initial_cookies: List[Dict[str, Any]] = initial_cookies or []
        atexit.register(self.close)

    def ensure_ready(self, headers: Dict[str, str]) -> None:
        if self._page is not None:
            return

        logger.info("Initializing browser")
        self._headers = headers
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        self._context = self._browser.new_context(
            user_agent=headers.get("User-Agent"),
            locale="es-ES",
            extra_http_headers={k: v for k, v in headers.items() if k.lower() != "user-agent"},
        )
        if self._initial_cookies:
            self._context.add_cookies(self._initial_cookies)
        self._page = self._context.new_page()
        logger.info("Opening Wallapop homepage")
        self._page.goto(WALLAPOP_HOME_URL, wait_until="networkidle", timeout=45000)
        self._page.wait_for_timeout(2000)

        logger.info("CloudFront bypass active")

    def fetch_json(self, url: str, headers: Dict[str, str]) -> Dict[str, Any]:
        self.ensure_ready(headers)
        if self._page is None:
            return {"ok": False, "status": 0, "error": "browser page not initialized"}

        logger.info("Executing browser fetch")
        result = self._page.evaluate(
            """
            async ({ url, headers }) => {
              try {
                const response = await fetch(url, {
                  method: 'GET',
                  headers,
                  credentials: 'include'
                });
                const text = await response.text();
                let data = null;
                try {
                  data = JSON.parse(text);
                } catch (_) {}

                return {
                  ok: response.ok,
                  status: response.status,
                  data,
                  textSample: text.slice(0, 300)
                };
              } catch (error) {
                return {
                  ok: false,
                  status: 0,
                  error: String(error)
                };
              }
            }
            """,
            {"url": url, "headers": headers},
        )
        return result if isinstance(result, dict) else {"ok": False, "status": 0, "error": "invalid browser result"}

    def fetch_json_context(self, url: str, headers: Dict[str, str]) -> Dict[str, Any]:
        self.ensure_ready(headers)
        if self._context is None:
            return {"ok": False, "status": 0, "error": "browser context not initialized"}

        logger.info("Executing browser fetch")
        try:
            response = self._context.request.get(url, headers=headers, timeout=45000)
            text = response.text()
            data = None
            try:
                data = response.json()
            except Exception:
                pass
            return {
                "ok": response.ok,
                "status": response.status,
                "data": data,
                "textSample": text[:300],
            }
        except Exception as exc:
            return {
                "ok": False,
                "status": 0,
                "error": str(exc),
            }

    def get_cookies(self, headers: Dict[str, str]) -> List[Dict[str, Any]]:
        self.ensure_ready(headers)
        if self._context is None:
            return []
        return self._context.cookies()

    def open_url(self, url: str, headers: Dict[str, str]) -> None:
        self.ensure_ready(headers)
        if self._page is None:
            raise RuntimeError("browser page not initialized")
        self._page.goto(url, wait_until="networkidle", timeout=45000)

    def get_page_html(self, headers: Dict[str, str]) -> str:
        self.ensure_ready(headers)
        if self._page is None:
            return ""
        return self._page.content()

    def close(self) -> None:
        if self._context is not None:
            try:
                self._context.close()
            except Exception:
                pass
            self._context = None
        if self._browser is not None:
            try:
                self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._playwright is not None:
            try:
                self._playwright.stop()
            except Exception:
                pass
            self._playwright = None
        self._page = None