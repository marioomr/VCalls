import logging
import json
import re
from urllib.parse import quote_plus
from typing import Any, Dict, List

from app.services.marketplaces.base_marketplace import MarketplaceService
import requests

logger = logging.getLogger(__name__)

SEARCH_PAGE_URL = "https://es.wallapop.com/search"
NEXT_DATA_URL_TEMPLATE = "https://es.wallapop.com/_next/data/{build_id}/es/search.json"

MAX_ITEMS = 20
TIMEOUT = 20


class WallapopService(MarketplaceService):
    def __init__(self) -> None:
        self._session = requests.Session()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def search(self, filters: dict) -> List[dict]:
        logger.info("Searching wallapop...")
        params = self._build_query_params(filters)

        try:
            logger.info("Fetching search page...")
            search_url = f"{SEARCH_PAGE_URL}?keywords={quote_plus(params['keywords'])}"
            page_response = self._session.get(
                search_url,
                headers=self._search_page_headers(),
                timeout=TIMEOUT,
            )
            page_response.raise_for_status()

            build_id = self._extract_build_id(page_response.text)
            if not build_id:
                logger.error("Build ID no detectado en __NEXT_DATA__")
                return []

            logger.info(f"Build ID detected: {build_id}")
            logger.info("Fetching Next.js search data...")

            data_url = NEXT_DATA_URL_TEMPLATE.format(build_id=build_id)
            data_response = self._session.get(
                data_url,
                params={
                    "keywords": params["keywords"],
                    "order_by": params["order_by"],
                },
                headers=self._next_data_headers(referer=search_url),
                timeout=TIMEOUT,
            )
            data_response.raise_for_status()
            payload = data_response.json()

            data_root = payload.get("data", payload)
            page_props = data_root.get("pageProps", {}) if isinstance(data_root, dict) else {}
            if not isinstance(page_props, dict):
                page_props = {}

            logger.info("pageProps keys: %s", list(page_props.keys()))

            items = page_props.get("initialSearchResult", {}).get("items")
            if not isinstance(items, list):
                items = page_props.get("searchObjects")
            if not isinstance(items, list):
                items = page_props.get("initialState", {}).get("search", {}).get("items")

            if not isinstance(items, list):
                logger.info("Wallapop response structure:")
                logger.info(str(list(payload.keys()) if isinstance(payload, dict) else [type(payload).__name__]))
                logger.info("pageProps content preview: %s", json.dumps(page_props, ensure_ascii=False, default=str)[:1000])
                return []

            logger.info("Items found: %s", len(items))
            return self._normalize(items)[:MAX_ITEMS]
        except Exception as exc:
            logger.error(f"[Wallapop] Error: {exc}")
            return []

    # ------------------------------------------------------------------
    # Headers
    # ------------------------------------------------------------------

    def _browser_headers(self) -> dict:
        return {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/121.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "es-ES,es;q=0.9",
            "Referer": "https://es.wallapop.com/",
            "Origin": "https://es.wallapop.com",
            "Connection": "keep-alive",
        }

    def _search_page_headers(self) -> dict:
        headers = self._browser_headers().copy()
        headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        return headers

    def _next_data_headers(self, referer: str) -> dict:
        headers = {
            "User-Agent": self._browser_headers()["User-Agent"],
            "Referer": referer,
            "x-nextjs-data": "1",
            "Accept": "application/json",
        }
        return headers

    def _extract_build_id(self, html: str) -> str:
        if not html:
            return ""

        # First attempt: parse __NEXT_DATA__ JSON payload.
        script_match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, flags=re.DOTALL)
        if script_match:
            raw_json = script_match.group(1)
            try:
                data = json.loads(raw_json)
                build_id = data.get("buildId")
                if isinstance(build_id, str) and build_id:
                    return build_id
            except Exception:
                pass

        # Fallback regex.
        regex_match = re.search(r'"buildId"\s*:\s*"([^"]+)"', html)
        if regex_match:
            return regex_match.group(1)
        return ""

    def _normalize(self, raw_items: list) -> List[dict]:
        normalized = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("id", "")).strip()
            if not item_id:
                continue
            slug = item.get("web_slug") or ""
            raw_price = item.get("price")
            price_value = raw_price.get("amount") if isinstance(raw_price, dict) else raw_price
            try:
                price_float = float(price_value) if price_value is not None else 0.0
            except (TypeError, ValueError):
                price_float = 0.0
            normalized.append(
                {
                    "id": item_id,
                    "title": item.get("title") or "Sin titulo",
                    "price": price_float,
                    "image": self._extract_image(item),
                    "url": f"https://es.wallapop.com/item/{slug}" if slug else "https://es.wallapop.com",
                    "published_at": str(item.get("created_at") or item.get("published_at") or ""),
                }
            )
        return normalized

    def _extract_image(self, content: dict) -> str:
        images = content.get("images") or content.get("images_urls") or []
        if not (isinstance(images, list) and images):
            return ""
        first = images[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            if "urls" in first:
                urls = first["urls"]
                return urls.get("big") or urls.get("medium") or urls.get("small") or ""
            return (
                first.get("big")
                or first.get("medium")
                or first.get("small")
                or first.get("original")
                or ""
            )
        return ""

    def _build_query_params(self, filters: dict) -> Dict[str, str]:
        # Debug test filter fijo solicitado.
        return {
            "keywords": "auriculares",
            "order_by": "newest",
        }
