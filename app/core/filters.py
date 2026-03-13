"""Filter adapters and normalization helpers."""

from dataclasses import asdict, dataclass
from typing import Optional
import uuid

from app.storage import get_enabled_filters as db_get_enabled_filters

DEFAULT_LATITUDE = 40.4168
DEFAULT_LONGITUDE = -3.7038
DEFAULT_DISTANCE = 200
DEFAULT_LIMIT = 40


@dataclass
class Filter:
    id: Optional[int] = None
    name: str = ""
    marketplace: str = "wallapop"
    keywords: str = ""
    category_id: Optional[str] = None
    subcategory_id: Optional[int] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    is_shippable: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_km: Optional[int] = None
    enabled: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


def get_enabled_filters() -> list:
    rows = db_get_enabled_filters()
    normalized = []
    for row in rows:
        flt = Filter(
            id=row.get("id"),
            name=row.get("name", ""),
            marketplace=str(row.get("marketplace", "wallapop")).lower(),
            keywords=row.get("keywords", ""),
            category_id=row.get("category_id"),
            subcategory_id=row.get("subcategory_id"),
            min_price=row.get("min_price"),
            max_price=row.get("max_price"),
            brand=row.get("brand"),
            condition=row.get("condition"),
            color=row.get("color"),
            size=row.get("size"),
            is_shippable=row.get("is_shippable"),
            latitude=row.get("latitude"),
            longitude=row.get("longitude"),
            distance_km=row.get("distance_km"),
            enabled=bool(row.get("enabled", False)),
        )
        normalized.append(flt.to_dict())
    return normalized


def build_wallapop_params(generic_filters: dict) -> dict:
    """Convert generic marketplace filters into Wallapop API params."""
    query = str(generic_filters.get("keyword") or generic_filters.get("query") or "").strip()
    min_price = generic_filters.get("min_price", generic_filters.get("min_sale_price"))
    max_price = generic_filters.get("max_price", generic_filters.get("max_sale_price"))

    params = {
        "source": "search_box",
        "order_by": "newest",
        "latitude": generic_filters.get("latitude", DEFAULT_LATITUDE),
        "longitude": generic_filters.get("longitude", DEFAULT_LONGITUDE),
        "distance_in_km": generic_filters.get("distance", DEFAULT_DISTANCE),
        "section_type": "organic_search_results",
        "search_id": str(uuid.uuid4()),
        "limit": int(generic_filters.get("limit", DEFAULT_LIMIT)),
    }

    if query:
        params["keywords"] = query

    category_ids = [str(i) for i in generic_filters.get("category_ids", []) if str(i).strip()]
    if len(category_ids) == 1:
        params["category_id"] = category_ids[0]
    elif len(category_ids) > 1:
        params["category_id"] = category_ids

    subcategory_ids = [str(i) for i in generic_filters.get("subcategory_ids", []) if str(i).strip()]
    if len(subcategory_ids) == 1:
        params["subcategory_id"] = subcategory_ids[0]
    elif len(subcategory_ids) > 1:
        params["subcategory_id"] = subcategory_ids

    if min_price is not None:
        params["min_sale_price"] = min_price
    if max_price is not None:
        params["max_sale_price"] = max_price

    return params
