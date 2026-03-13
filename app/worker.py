"""Main worker entrypoint for multi-marketplace monitoring."""

import logging
import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from app.core import search_worker
from app.core.logger import setup
from app.core.scheduler import start
from app.services import telegram
from app.services.marketplaces.wallapop_service import WallapopService
from app.storage import bootstrap_filters_from_json, get_filters as db_get_filters, init_db

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "products.json")
logger = logging.getLogger(__name__)

SERVICES = {
    "wallapop": WallapopService(),
}


def get_interval() -> int:
    return int(os.getenv("CHECK_INTERVAL", "30"))


def get_filters() -> list:
    return db_get_filters(enabled_only=True)


def process_filter(filter_row: dict) -> list:
    marketplace = str(filter_row.get("marketplace", "")).lower()
    service = SERVICES.get(marketplace)
    if not service:
        logger.warning(f"[Worker] Marketplace no soportado: {marketplace}")
        return []
    return search_worker.run_filter(filter_row, service)


def on_new_item(filter_row: dict, item: dict) -> None:
    name = filter_row.get("name", "?")
    title = item.get("title", item.get("name", "Sin titulo"))
    url = item.get("url", item.get("link", ""))
    logger.info(f"[NUEVO] [{name}] {title} | {item.get('price', 0)} | {url}")
    telegram.send(filter_row, item)


def main() -> None:
    setup()

    init_db()
    bootstrap_filters_from_json(CONFIG_PATH)

    enabled_filters = get_filters()
    logger.info("=" * 60)
    logger.info("  Multi Marketplace Worker")
    logger.info("  DB            : data/sniper.db")
    logger.info(f"  Filtros activos: {len(enabled_filters)}")
    logger.info(f"  Intervalo     : {get_interval()}s")
    logger.info("=" * 60)

    start(
        get_filters=get_filters,
        get_interval=get_interval,
        process_filter=process_filter,
        on_new_item=on_new_item,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("[Worker] Bot detenido por el usuario (Ctrl+C).")
