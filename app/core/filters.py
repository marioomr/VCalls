"""Filter adapters and normalization helpers."""

import uuid

DEFAULT_LATITUDE = 40.4168
DEFAULT_LONGITUDE = -3.7038
DEFAULT_DISTANCE = 200
DEFAULT_LIMIT = 40


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
