import logging
import uuid

import requests

from app.core.filters import build_wallapop_params
from app.services.marketplaces.base_marketplace import MarketplaceService

logger = logging.getLogger(__name__)

BASE_URL = "https://api.wallapop.com/api/v3/search/section"
APP_VERSION = "817640"
DEVICE_ID = str(uuid.uuid4())


class WallapopService(MarketplaceService):
    def __init__(self) -> None:
        self._session = requests.Session()

    def search(self, filters: dict) -> list:
        params = build_wallapop_params(filters)
        try:
            response = self._session.get(
                BASE_URL,
                params=params,
                headers=self._headers(),
                timeout=15,
            )
            response.raise_for_status()
            payload = response.json()
            return self._normalize_items(payload)
        except requests.HTTPError as e:
            logger.error(f"[Wallapop] HTTP {e.response.status_code}: {e.response.text[:200]}")
            return []
        except requests.ConnectionError:
            logger.error("[Wallapop] Error de conexion")
            return []
        except requests.Timeout:
            logger.error("[Wallapop] Timeout")
            return []
        except Exception as e:
            logger.error(f"[Wallapop] Error inesperado: {e}")
            return []

    def _headers(self) -> dict:
        return {
            "accept": "application/json, text/plain, */*",
            "accept-language": "es-ES,es;q=0.9",
            "x-appversion": APP_VERSION,
            "x-deviceid": DEVICE_ID,
            "x-deviceos": "0",
            "origin": "https://es.wallapop.com",
            "referer": "https://es.wallapop.com/",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "user-agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
        }

    def _normalize_items(self, data: dict) -> list:
        raw_items = (
            data.get("search_objects")
            or (data.get("data") or {}).get("section", {}).get("items")
            or (data.get("data") or {}).get("items")
            or data.get("items")
            or data.get("results")
            or []
        )

        if not isinstance(raw_items, list):
            return []

        normalized = []
        for entry in raw_items:
            content = entry.get("content") or entry
            item_id = str(content.get("id", "")).strip()
            if not item_id:
                continue

            title = content.get("title") or "Sin titulo"
            slug = content.get("web_slug") or content.get("slug") or ""
            url = f"https://es.wallapop.com/item/{slug}" if slug else "https://es.wallapop.com"
            image = self._extract_image(content)
            price = self._extract_price(content.get("price"))

            normalized.append(
                {
                    "id": item_id,
                    "title": title,
                    "price": price,
                    "url": url,
                    "image": image,
                    "marketplace": "wallapop",
                }
            )

        return normalized

    def _extract_price(self, price_obj):
        if isinstance(price_obj, dict):
            amount = price_obj.get("amount", price_obj.get("price"))
            if amount is None:
                return 0
            try:
                return float(amount)
            except (TypeError, ValueError):
                return 0
        try:
            return float(price_obj)
        except (TypeError, ValueError):
            return 0

    def _extract_image(self, content: dict) -> str:
        images = content.get("images") or []
        if isinstance(images, list) and images:
            first = images[0]
            if isinstance(first, dict):
                return (
                    first.get("big")
                    or first.get("medium")
                    or first.get("small")
                    or first.get("original")
                    or ""
                )
            if isinstance(first, str):
                return first
        return ""
