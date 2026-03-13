"""
telegram.py
-----------
Telegram notification service.
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)

_TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


def send(product: dict, item: dict) -> None:
    token = os.getenv("TELEGRAM_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()

    if not token or not chat_id:
        logger.warning("[Telegram] TELEGRAM_TOKEN o TELEGRAM_CHAT_ID no definidos.")
        return

    filter_name = product.get("name", "?")
    marketplace = item.get("marketplace", product.get("marketplace", "wallapop"))
    title = item.get("title", item.get("name", "Sin nombre"))
    url = item.get("url", item.get("link", ""))

    price = item.get("price", "N/D")
    if isinstance(price, (int, float)):
        price_text = f"{price:.2f} EUR"
    else:
        price_text = str(price)

    text = (
        f"Nuevo articulo en {marketplace}\n\n"
        f"Filtro: {filter_name}\n"
        f"Nombre: {title}\n"
        f"Precio: {price_text}\n\n"
        f"{url}"
    )

    try:
        url = _TELEGRAM_API.format(token=token)
        resp = requests.post(
            url,
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": False},
            timeout=10,
        )
        if resp.status_code == 200:
            logger.info(f"[Telegram] Alerta enviada: {title}")
        else:
            logger.error(f"[Telegram] Error HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"[Telegram] Error enviando mensaje: {e}")
