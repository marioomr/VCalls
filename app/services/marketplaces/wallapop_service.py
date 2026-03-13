import logging
import random
from typing import Dict, List
from uuid import uuid4

from app.services.marketplaces.base_marketplace import MarketplaceService
import requests

logger = logging.getLogger(__name__)

SEARCH_SECTION_ENDPOINT = "https://api.wallapop.com/api/v3/search/section"

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
            data_response = self._session.get(
                SEARCH_SECTION_ENDPOINT,
                params=params,
                headers=self._request_headers(),
                timeout=TIMEOUT,
            )

            if data_response.status_code != 200:
                logger.error("[Wallapop] Status no esperado: %s", data_response.status_code)
                logger.error("[Wallapop] Respuesta: %s", data_response.text[:300].replace("\n", " "))
                return []

            payload = data_response.json()
            items = ((((payload.get("data") or {}).get("section") or {}).get("items")) or [])

            if not isinstance(items, list):
                logger.error("[Wallapop] Formato inesperado: data.section.items")
                return []

            logger.info("Items found: %s", len(items))
            return self._normalize(items)[:MAX_ITEMS]
        except Exception as exc:
            logger.error(f"[Wallapop] Error: {exc}")
            return []

    # ------------------------------------------------------------------
    # Headers
    # ------------------------------------------------------------------

    def _request_headers(self) -> dict:
        tracking_user_id = str(random.randint(10**17, (10**18) - 1))
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
            "x-deviceid": str(uuid4()),
            "trackinguserid": tracking_user_id,
            "mpid": tracking_user_id,
            "x-deviceos": "0",
            "deviceos": "0",
            "x-appversion": "817710",
        }

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
                    "url": f"https://es.wallapop.com/item/{slug}" if slug else "https://es.wallapop.com",
                    "city": ((item.get("location") or {}).get("city")) or "",
                    "created_at": str(item.get("created_at") or item.get("published_at") or ""),
                }
            )
        return normalized

    def _build_query_params(self, filters: dict) -> Dict[str, str]:
        params: Dict[str, str] = {
            "source": "deep_link",
            "order_by": "newest",
            "section_type": "organic_search_results",
            "search_id": str(uuid4()),
        }

        keywords = str(filters.get("keywords") or "").strip()
        if keywords:
            params["keywords"] = keywords

        category_id = filters.get("category_id") or filters.get("category")
        if category_id is not None and str(category_id).strip():
            params["category_id"] = str(category_id).strip()

        subcategory_id = filters.get("subcategory_id") or filters.get("subcategory")
        if subcategory_id is not None and str(subcategory_id).strip():
            params["subcategory_ids"] = str(subcategory_id).strip()

        min_price = filters.get("min_price")
        max_price = filters.get("max_price")
        if min_price is not None and str(min_price).strip() != "":
            params["min_sale_price"] = str(min_price)
        if max_price is not None and str(max_price).strip() != "":
            params["max_sale_price"] = str(max_price)

        brand = filters.get("brand")
        if brand and str(brand).strip():
            params["brand"] = str(brand).strip()

        condition = filters.get("condition")
        if condition and str(condition).strip():
            params["condition"] = str(condition).strip()

        color = filters.get("color")
        if color and str(color).strip():
            params["color"] = str(color).strip()

        size = filters.get("size")
        if size and str(size).strip():
            params["fashion_size"] = str(size).strip()

        if filters.get("is_shippable") is True:
            params["is_shippable"] = "true"

        latitude = filters.get("latitude")
        longitude = filters.get("longitude")
        distance_km = filters.get("distance_km")
        if latitude is not None and longitude is not None:
            params["latitude"] = str(latitude)
            params["longitude"] = str(longitude)
            if distance_km is not None:
                params["distance_in_km"] = str(distance_km)

        return params
