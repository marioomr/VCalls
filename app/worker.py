"""Wallapop worker 24/7 using direct search endpoint without browser cookies."""

import logging
import random
import os
import sys
import time
from typing import Dict, List
from uuid import uuid4

import requests

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.logger import setup

logger = logging.getLogger(__name__)

WALLAPOP_DIRECT_ENDPOINT = "https://api.wallapop.com/api/v3/search/section"
REQUEST_TIMEOUT = 30

CHROME_USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
]


def build_runtime_identifiers() -> Dict[str, str]:
    return {
        "device_id": str(uuid4()),
        "tracking_user_id": str(random.randint(10**17, (10**18) - 1)),
    }


def build_headers(device_id: str, tracking_user_id: str) -> Dict[str, str]:
    return {
        "accept": "application/json, text/plain, */*",
        "user-agent": random.choice(CHROME_USER_AGENTS),
        "origin": "https://es.wallapop.com",
        "referer": "https://es.wallapop.com/",
        "x-deviceid": device_id,
        "trackinguserid": tracking_user_id,
        "mpid": tracking_user_id,
        "x-deviceos": "0",
        "deviceos": "0",
        "x-appversion": "817710",
    }


def build_search_params() -> Dict[str, str]:
    return {
        "keywords": "auriculares",
        "source": "deep_link",
        "order_by": "most_relevance",
        "category_id": "24200",
        "section_type": "organic_search_results",
        "search_id": str(uuid4()),
    }


def parse_items(payload: dict) -> List[dict]:
    items = ((((payload.get("data") or {}).get("section") or {}).get("items")) or [])
    if not isinstance(items, list):
        return []
    return items


def buscar_wallapop(device_id: str, tracking_user_id: str) -> None:
    headers = build_headers(device_id=device_id, tracking_user_id=tracking_user_id)
    params = build_search_params()

    try:
        response = requests.get(
            WALLAPOP_DIRECT_ENDPOINT,
            params=params,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.error("[Wallapop] Error HTTP: %s", exc)
        return

    if response.status_code != 200:
        preview = response.text[:300].replace("\n", " ")
        logger.error("[Wallapop] Status no esperado: %s", response.status_code)
        logger.error("[Wallapop] Respuesta: %s", preview)
        return

    try:
        payload = response.json()
    except ValueError as exc:
        logger.error("[Wallapop] Error parseando JSON: %s", exc)
        return

    items = parse_items(payload)
    if not items:
        logger.warning("[Wallapop] No se encontraron articulos en data.section.items")
        return

    logger.info("[Wallapop] Articulos encontrados: %s", len(items))
    for item in items:
        if not isinstance(item, dict):
            continue
        title = item.get("title") or "Sin titulo"
        price_amount = (item.get("price") or {}).get("amount")
        city = ((item.get("location") or {}).get("city")) or "Sin ciudad"
        logger.info("%s - %s€ - %s", title, price_amount, city)


def main() -> None:
    setup()
    logging.getLogger().setLevel(logging.DEBUG)

    runtime = build_runtime_identifiers()
    device_id = runtime["device_id"]
    tracking_user_id = runtime["tracking_user_id"]

    logger.info("[Worker] Iniciado modo 24/7 Wallapop")
    logger.info("[Worker] device_id=%s", device_id)
    logger.info("[Worker] tracking_user_id=%s", tracking_user_id)

    while True:
        buscar_wallapop(device_id=device_id, tracking_user_id=tracking_user_id)
        sleep_seconds = random.randint(15, 30)
        logger.debug("[Worker] Esperando %ss para la siguiente consulta", sleep_seconds)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("[Worker] Bot detenido por el usuario (Ctrl+C).")
        sys.exit(0)
