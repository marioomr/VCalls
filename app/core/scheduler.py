"""24/7 scheduler loop for all enabled filters."""

import logging
import random
import time

logger = logging.getLogger(__name__)


def _jitter(base_seconds: float) -> float:
    deviation = base_seconds * 0.20
    return base_seconds + random.uniform(-deviation, deviation)


def run_cycle(filters: list, process_filter, on_new_item=None) -> None:
    if not filters:
        logger.warning("[Scheduler] No hay filtros habilitados.")
        return

    logger.info(f"[Scheduler] Ciclo iniciado: {len(filters)} filtro(s) activo(s).")

    for filter_row in filters:
        new_items = process_filter(filter_row)
        if on_new_item:
            for item in new_items:
                try:
                    on_new_item(filter_row, item)
                except Exception as e:
                    logger.error(f"[Scheduler] Error en callback on_new_item: {e}")

    logger.info("[Scheduler] Ciclo completado.")


def start(get_filters, get_interval, process_filter, on_new_item=None) -> None:
    logger.info("[Scheduler] Bot arrancado.")

    while True:
        try:
            filters = get_filters()
            interval = int(get_interval())
            run_cycle(filters, process_filter=process_filter, on_new_item=on_new_item)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            logger.error(f"[Scheduler] Error inesperado en ciclo: {e}")
            interval = 25

        sleep_time = _jitter(max(interval, 1))
        logger.info(f"[Scheduler] Esperando {sleep_time:.1f}s hasta el proximo ciclo...")
        time.sleep(sleep_time)
