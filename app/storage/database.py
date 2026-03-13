import json
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "sniper.db")


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _table_columns(conn: sqlite3.Connection, table_name: str) -> List[str]:
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cur.fetchall()]


def _migrate_filters_schema(conn: sqlite3.Connection) -> None:
    columns = _table_columns(conn, "filters")
    if not columns:
        return

    target_columns = {
        "id",
        "name",
        "marketplace",
        "keywords",
        "category_id",
        "subcategory_id",
        "min_price",
        "max_price",
        "brand",
        "condition",
        "color",
        "size",
        "is_shippable",
        "latitude",
        "longitude",
        "distance_km",
        "enabled",
        "created_at",
    }

    if set(columns) == target_columns:
        return

    cur = conn.cursor()
    cur.execute("SELECT * FROM filters ORDER BY id ASC")
    rows = cur.fetchall()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS filters_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            marketplace TEXT NOT NULL,
            keywords TEXT NOT NULL DEFAULT '',
            category_id TEXT,
            subcategory_id INTEGER,
            min_price REAL,
            max_price REAL,
            brand TEXT,
            condition TEXT,
            color TEXT,
            size TEXT,
            is_shippable INTEGER,
            latitude REAL,
            longitude REAL,
            distance_km INTEGER,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    for row in rows:
        row_map = dict(row)
        params = {}
        if "parameters_json" in row_map and row_map.get("parameters_json"):
            try:
                params = json.loads(row_map.get("parameters_json") or "{}")
            except Exception:
                params = {}
        if not isinstance(params, dict):
            params = {}

        keywords = row_map.get("keywords") or params.get("keywords") or params.get("keyword") or ""
        category_id = row_map.get("category_id") or params.get("category_id")
        subcategory_id = row_map.get("subcategory_id") or params.get("subcategory_id")
        min_price = row_map.get("min_price") if row_map.get("min_price") is not None else params.get("min_price")
        max_price = row_map.get("max_price") if row_map.get("max_price") is not None else params.get("max_price")
        brand = row_map.get("brand") if row_map.get("brand") is not None else params.get("brand")
        condition = row_map.get("condition") if row_map.get("condition") is not None else params.get("condition")
        color = row_map.get("color") if row_map.get("color") is not None else params.get("color")
        size = row_map.get("size") if row_map.get("size") is not None else params.get("fashion_size")
        is_shippable = (
            row_map.get("is_shippable")
            if row_map.get("is_shippable") is not None
            else params.get("is_shippable")
        )
        latitude = row_map.get("latitude") if row_map.get("latitude") is not None else params.get("latitude")
        longitude = row_map.get("longitude") if row_map.get("longitude") is not None else params.get("longitude")
        distance_km = (
            row_map.get("distance_km")
            if row_map.get("distance_km") is not None
            else params.get("distance_in_km")
        )

        conn.execute(
            """
            INSERT INTO filters_new (
                id, name, marketplace, keywords, category_id, subcategory_id, min_price, max_price,
                brand, condition, color, size, is_shippable, latitude, longitude, distance_km,
                enabled, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_map.get("id"),
                row_map.get("name") or "Unnamed",
                (row_map.get("marketplace") or "wallapop").lower(),
                str(keywords).strip(),
                str(category_id).strip() if category_id is not None else None,
                int(subcategory_id) if subcategory_id not in (None, "") else None,
                float(min_price) if min_price is not None else None,
                float(max_price) if max_price is not None else None,
                str(brand).strip() if brand not in (None, "") else None,
                str(condition).strip() if condition not in (None, "") else None,
                str(color).strip() if color not in (None, "") else None,
                str(size).strip() if size not in (None, "") else None,
                1 if str(is_shippable).lower() in {"1", "true", "yes", "on"} else 0 if is_shippable is not None else None,
                float(latitude) if latitude not in (None, "") else None,
                float(longitude) if longitude not in (None, "") else None,
                int(distance_km) if distance_km not in (None, "") else None,
                int(row_map.get("enabled", 1)),
                row_map.get("created_at") or "",
            ),
        )

    conn.execute("DROP TABLE filters")
    conn.execute("ALTER TABLE filters_new RENAME TO filters")


def _migrate_seen_items_schema(conn: sqlite3.Connection) -> None:
    columns = _table_columns(conn, "seen_items")
    if not columns:
        return
    if "filter_id" in columns:
        return

    conn.execute("ALTER TABLE seen_items RENAME TO seen_items_legacy")
    conn.execute(
        """
        CREATE TABLE seen_items (
            item_id TEXT NOT NULL,
            filter_id INTEGER NOT NULL,
            first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (item_id, filter_id)
        )
        """
    )
    conn.execute("DROP TABLE IF EXISTS seen_items_legacy")


def init_db() -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS filters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                marketplace TEXT NOT NULL,
                keywords TEXT NOT NULL DEFAULT '',
                category_id TEXT,
                subcategory_id INTEGER,
                min_price REAL,
                max_price REAL,
                brand TEXT,
                condition TEXT,
                color TEXT,
                size TEXT,
                is_shippable INTEGER,
                latitude REAL,
                longitude REAL,
                distance_km INTEGER,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                price REAL,
                city TEXT,
                marketplace TEXT NOT NULL,
                url TEXT,
                created_at TEXT,
                detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                filter_id INTEGER
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS seen_items (
                item_id TEXT NOT NULL,
                filter_id INTEGER NOT NULL,
                first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (item_id, filter_id)
            )
            """
        )
        _migrate_seen_items_schema(conn)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_filters_enabled ON filters(enabled)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_detected_at ON items(detected_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_seen_item_id ON seen_items(item_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_seen_filter ON seen_items(filter_id)")
        _migrate_filters_schema(conn)
        _ensure_filter_columns(conn)
        conn.commit()
    finally:
        conn.close()


def _ensure_filter_columns(conn: sqlite3.Connection) -> None:
    columns = set(_table_columns(conn, "filters"))
    missing_columns = {
        "brand": "TEXT",
        "condition": "TEXT",
        "color": "TEXT",
        "size": "TEXT",
        "is_shippable": "INTEGER",
        "latitude": "REAL",
        "longitude": "REAL",
        "distance_km": "INTEGER",
    }
    for column_name, sql_type in missing_columns.items():
        if column_name not in columns:
            conn.execute(f"ALTER TABLE filters ADD COLUMN {column_name} {sql_type}")


def _map_filter_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "marketplace": row["marketplace"],
        "keywords": row["keywords"] or "",
        "category_id": row["category_id"],
        "subcategory_id": row["subcategory_id"],
        "min_price": row["min_price"],
        "max_price": row["max_price"],
        "brand": row["brand"],
        "condition": row["condition"],
        "color": row["color"],
        "size": row["size"],
        "is_shippable": bool(row["is_shippable"]) if row["is_shippable"] is not None else None,
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": row["distance_km"],
        "enabled": bool(row["enabled"]),
        "created_at": row["created_at"],
    }


def get_filters(enabled_only: bool = True) -> List[Dict[str, Any]]:
    conn = _connect()
    try:
        cur = conn.cursor()
        if enabled_only:
            cur.execute(
                "SELECT id, name, marketplace, keywords, category_id, subcategory_id, min_price, max_price, "
                "brand, condition, color, size, is_shippable, latitude, longitude, distance_km, enabled, created_at "
                "FROM filters WHERE enabled = 1 ORDER BY id ASC"
            )
        else:
            cur.execute(
                "SELECT id, name, marketplace, keywords, category_id, subcategory_id, min_price, max_price, "
                "brand, condition, color, size, is_shippable, latitude, longitude, distance_km, enabled, created_at "
                "FROM filters ORDER BY id ASC"
            )
        return [_map_filter_row(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_enabled_filters() -> List[Dict[str, Any]]:
    return get_filters(enabled_only=True)


def add_filter(
    name: str,
    marketplace: str,
    keywords: str,
    category_id: Optional[str] = None,
    subcategory_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    brand: Optional[str] = None,
    condition: Optional[str] = None,
    color: Optional[str] = None,
    size: Optional[str] = None,
    is_shippable: Optional[bool] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    distance_km: Optional[int] = None,
    enabled: bool = True,
) -> int:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO filters (
                name, marketplace, keywords, category_id, subcategory_id, min_price, max_price,
                brand, condition, color, size, is_shippable, latitude, longitude, distance_km, enabled
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name.strip(),
                marketplace.strip().lower(),
                (keywords or "").strip(),
                category_id.strip() if isinstance(category_id, str) and category_id.strip() else None,
                int(subcategory_id) if subcategory_id is not None else None,
                float(min_price) if min_price is not None else None,
                float(max_price) if max_price is not None else None,
                str(brand).strip() if brand not in (None, "") else None,
                str(condition).strip() if condition not in (None, "") else None,
                str(color).strip() if color not in (None, "") else None,
                str(size).strip() if size not in (None, "") else None,
                1 if is_shippable is True else 0 if is_shippable is False else None,
                float(latitude) if latitude is not None else None,
                float(longitude) if longitude is not None else None,
                int(distance_km) if distance_km is not None else None,
                1 if enabled else 0,
            ),
        )
        conn.commit()
        created_id = int(cur.lastrowid)
        logger.info("[NEW_FILTER] id=%s name=%s marketplace=%s", created_id, name.strip(), marketplace.strip().lower())
        return created_id
    finally:
        conn.close()


def update_filter(
    filter_id: int,
    name: str,
    marketplace: str,
    keywords: str,
    category_id: Optional[str] = None,
    subcategory_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    brand: Optional[str] = None,
    condition: Optional[str] = None,
    color: Optional[str] = None,
    size: Optional[str] = None,
    is_shippable: Optional[bool] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    distance_km: Optional[int] = None,
    enabled: bool = True,
) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE filters
            SET name = ?, marketplace = ?, keywords = ?, category_id = ?, subcategory_id = ?, min_price = ?, max_price = ?,
                brand = ?, condition = ?, color = ?, size = ?, is_shippable = ?, latitude = ?, longitude = ?, distance_km = ?,
                enabled = ?
            WHERE id = ?
            """,
            (
                name.strip(),
                marketplace.strip().lower(),
                (keywords or "").strip(),
                category_id.strip() if isinstance(category_id, str) and category_id.strip() else None,
                int(subcategory_id) if subcategory_id is not None else None,
                float(min_price) if min_price is not None else None,
                float(max_price) if max_price is not None else None,
                str(brand).strip() if brand not in (None, "") else None,
                str(condition).strip() if condition not in (None, "") else None,
                str(color).strip() if color not in (None, "") else None,
                str(size).strip() if size not in (None, "") else None,
                1 if is_shippable is True else 0 if is_shippable is False else None,
                float(latitude) if latitude is not None else None,
                float(longitude) if longitude is not None else None,
                int(distance_km) if distance_km is not None else None,
                1 if enabled else 0,
                int(filter_id),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def set_filter_enabled(filter_id: int, enabled: bool) -> None:
    conn = _connect()
    try:
        conn.execute("UPDATE filters SET enabled = ? WHERE id = ?", (1 if enabled else 0, int(filter_id)))
        conn.commit()
    finally:
        conn.close()


def set_all_filters_enabled(enabled: bool) -> int:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE filters SET enabled = ?", (1 if enabled else 0,))
        conn.commit()
        return int(cur.rowcount)
    finally:
        conn.close()


def delete_filter(filter_id: int) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM filters WHERE id = ?", (filter_id,))
        cur.execute("DELETE FROM seen_items WHERE filter_id = ?", (filter_id,))
        conn.commit()
    finally:
        conn.close()


def is_item_seen(filter_id: int, item_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM seen_items WHERE filter_id = ? AND item_id = ? LIMIT 1",
            (int(filter_id), str(item_id)),
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


def mark_item_seen(filter_id: int, item_id: str) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO seen_items (item_id, filter_id) VALUES (?, ?)",
            (str(item_id), int(filter_id)),
        )
        conn.commit()
    finally:
        conn.close()


def save_item(item: Dict[str, Any], marketplace: str, filter_id: int) -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO items (item_id, title, price, city, marketplace, url, created_at, filter_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(item.get("id", "")).strip(),
                item.get("title") or "Sin titulo",
                float(item.get("price")) if item.get("price") is not None else None,
                item.get("city") or "",
                marketplace,
                item.get("url") or "",
                item.get("created_at") or "",
                int(filter_id),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_recent_items(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, item_id, title, price, city, marketplace, url, created_at, detected_at, filter_id
            FROM items
            ORDER BY detected_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (max(1, int(limit)), max(0, int(offset))),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def search_items(query: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, item_id, title, price, city, marketplace, url, created_at, detected_at, filter_id
            FROM items
            WHERE title LIKE ?
            ORDER BY detected_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (f"%{query.strip()}%", max(1, int(limit)), max(0, int(offset))),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def clear_items(reset_seen_items: bool = True) -> Dict[str, int]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM items")
        deleted_items = int(cur.rowcount)
        deleted_seen = 0
        if reset_seen_items:
            cur.execute("DELETE FROM seen_items")
            deleted_seen = int(cur.rowcount)
        conn.commit()
        return {"items": deleted_items, "seen_items": deleted_seen}
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
        keywords = str(product.get("keywords") or product.get("keyword") or "").strip()
        category_id = product.get("category_id")
        subcategory_id = product.get("subcategory_id")
        min_price = product.get("min_price")
        max_price = product.get("max_price")

        add_filter(
            name=name,
            marketplace="wallapop",
            keywords=keywords,
            category_id=str(category_id) if category_id is not None else None,
            subcategory_id=int(subcategory_id) if subcategory_id is not None else None,
            min_price=float(min_price) if min_price is not None else None,
            max_price=float(max_price) if max_price is not None else None,
            enabled=enabled,
        )

    logger.info(f"[DB] Bootstrap completado: {len(products)} filtros importados.")
