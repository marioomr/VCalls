"""Main worker entrypoint for marketplace monitoring."""

import logging
import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from app.core import search_worker
from app.core.filters import get_enabled_filters
from app.core.logger import setup
from app.services import telegram
from app.services.marketplaces import get_marketplace_service
from app.storage import bootstrap_filters_from_json, init_db

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "products.json")
logger = logging.getLogger(__name__)

def get_interval() -> int:
    return 20


def process_filter(filter_row: dict) -> list:
    marketplace = str(filter_row.get("marketplace", "")).lower()
    service = get_marketplace_service(marketplace)
    if not service:
        logger.warning("[Worker] Marketplace no soportado: %s", marketplace)
        return []
    return search_worker.run_filter(filter_row, service)


def on_new_item(filter_row: dict, item: dict) -> None:
    url = item.get("url", "")
    if url:
        telegram.send(filter_row, item)


def main() -> None:
    setup()

    init_db()
    bootstrap_filters_from_json(CONFIG_PATH)

    from app.core.scheduler import start

    logger.info("=" * 60)
    logger.info("  Multi Marketplace Worker")
    logger.info("  DB            : data/sniper.db")
    logger.info("  Sleep random  : 15-30s")
    logger.info("=" * 60)

    start(
        get_filters=get_enabled_filters,
        get_interval=get_interval,
        process_filter=process_filter,
        on_new_item=on_new_item,
        random_sleep_range=(15, 30),
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("[Worker] Bot detenido por el usuario (Ctrl+C).")
