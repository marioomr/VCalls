import json
import logging
import os
import sqlite3
from typing import Optional

logger = logging.getLogger(__name__)

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "sniper.db")


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS filters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                marketplace TEXT NOT NULL,
                name TEXT NOT NULL,
                parameters_json TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS seen_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                marketplace TEXT NOT NULL,
                item_id TEXT NOT NULL,
                first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(marketplace, item_id)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_filters(enabled_only: bool = True) -> list:
    conn = _connect()
    try:
        cur = conn.cursor()
        if enabled_only:
            cur.execute(
                "SELECT id, marketplace, name, parameters_json, enabled, created_at "
                "FROM filters WHERE enabled = 1 ORDER BY id ASC"
            )
        else:
            cur.execute(
                "SELECT id, marketplace, name, parameters_json, enabled, created_at "
                "FROM filters ORDER BY id ASC"
            )

        rows = cur.fetchall()
        result = []
        for row in rows:
            try:
                parameters = json.loads(row["parameters_json"]) if row["parameters_json"] else {}
            except json.JSONDecodeError:
                logger.warning(f"[DB] parameters_json invalido en filtro id={row['id']}; usando {{}}")
                parameters = {}
            result.append(
                {
                    "id": row["id"],
                    "marketplace": row["marketplace"],
                    "name": row["name"],
                    "parameters": parameters,
                    "enabled": bool(row["enabled"]),
                    "created_at": row["created_at"],
                }
            )
        return result
    finally:
        conn.close()


def add_filter(marketplace: str, name: str, parameters: dict, enabled: bool = True) -> int:
    payload = json.dumps(parameters or {}, ensure_ascii=False)
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO filters (marketplace, name, parameters_json, enabled) VALUES (?, ?, ?, ?)",
            (marketplace, name, payload, 1 if enabled else 0),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def delete_filter(filter_id: int) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM filters WHERE id = ?", (filter_id,))
        conn.commit()
    finally:
        conn.close()


def is_item_seen(marketplace: str, item_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM seen_items WHERE marketplace = ? AND item_id = ? LIMIT 1",
            (marketplace, str(item_id)),
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


def mark_item_seen(marketplace: str, item_id: str) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO seen_items (marketplace, item_id) VALUES (?, ?)",
            (marketplace, str(item_id)),
        )
        conn.commit()
    finally:
        conn.close()


def _count_filters() -> int:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM filters")
        return int(cur.fetchone()[0])
    finally:
        conn.close()


def bootstrap_filters_from_json(config_path: str) -> None:
    if _count_filters() > 0:
        return

    if not os.path.exists(config_path):
        return

    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception as e:
        logger.warning(f"[DB] No se pudo leer {config_path} para bootstrap: {e}")
        return

    products = raw if isinstance(raw, list) else raw.get("products", []) if isinstance(raw, dict) else []
    for product in products:
        name = product.get("name", "Unnamed")
        enabled = bool(product.get("enabled", True))
        parameters = {
            k: v for k, v in product.items() if k not in {"name", "enabled"}
        }
        add_filter("wallapop", name, parameters, enabled=enabled)

    logger.info(f"[DB] Bootstrap completado: {len(products)} filtros importados.")
