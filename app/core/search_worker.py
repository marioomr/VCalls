"""Search worker for one filter row and one marketplace service."""

import logging

from app.storage import is_item_seen, mark_item_seen, save_item

logger = logging.getLogger(__name__)

_seeded_filter_ids = set()


def run_filter(filter_row: dict, service) -> list:
    filter_id = filter_row.get("id")
    if filter_id is None:
        logger.error("[Worker] Filtro sin id; se omite.")
        return []

    marketplace = str(filter_row.get("marketplace", "wallapop")).lower()
    name = filter_row.get("name", "?")
    items = service.search(filter_row)

    if not items:
        logger.warning(f"[{marketplace}:{name}] El marketplace no devolvio articulos.")
        return []

    if filter_id not in _seeded_filter_ids:
        _seeded_filter_ids.add(filter_id)
        for item in items:
            item_id = item.get("id")
            if item_id:
                mark_item_seen(filter_id, item_id)
        logger.info(
            f"[{marketplace}:{name}] Primera ejecucion: {len(items)} articulos marcados como vistos."
        )
        return []

    new_items = []
    for item in items:
        item_id = item.get("id")
        if not item_id:
            continue
        if is_item_seen(filter_id, item_id):
            continue

        mark_item_seen(filter_id, item_id)
        save_item(item=item, marketplace=marketplace, filter_id=int(filter_id))

        title = item.get("title", "Sin titulo")
        price = item.get("price", "N/D")
        city = item.get("city", "Sin ciudad")
        logger.info("[NEW][%s] %s - %s€ - %s", marketplace, title, price, city)
        new_items.append(item)

    if not new_items:
        logger.info(f"[{marketplace}:{name}] Sin articulos nuevos.")
        return []

    logger.info(f"[{marketplace}:{name}] {len(new_items)} articulo(s) nuevo(s) detectado(s).")
    return new_items
