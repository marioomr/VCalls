import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.storage.database import (
    add_filter,
    clear_items,
    delete_filter,
    get_filters,
    get_recent_items,
    init_db,
    search_items,
    set_all_filters_enabled,
    set_filter_enabled,
    update_filter,
)

load_dotenv()

app = FastAPI(title="Sniper API", version="1.0.0")
templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))
FRONTEND_DIST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)
FRONTEND_INDEX_FILE = os.path.join(FRONTEND_DIST_DIR, "index.html")

if os.path.isdir(os.path.join(FRONTEND_DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST_DIR, "assets")), name="assets")


class FilterCreate(BaseModel):
    marketplace: str = Field(..., examples=["wallapop"])
    name: str = Field(..., examples=["cheap nike"])
    keywords: str = Field(..., examples=["nike"])
    category: Optional[int] = None
    subcategory: Optional[int] = None
    category_id: Optional[int] = None
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
    enabled: bool = True


class FilterUpdate(FilterCreate):
    pass


def _category_from_payload(payload: FilterCreate) -> Optional[int]:
    return payload.category_id if payload.category_id is not None else payload.category


def _subcategory_from_payload(payload: FilterCreate) -> Optional[int]:
    return payload.subcategory_id if payload.subcategory_id is not None else payload.subcategory


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/api/filters")
def api_get_filters() -> list:
    return get_filters(enabled_only=False)


@app.post("/api/filters")
def api_add_filter(payload: FilterCreate) -> dict:
    category_id = _category_from_payload(payload)
    subcategory_id = _subcategory_from_payload(payload)
    filter_id = add_filter(
        name=payload.name,
        marketplace=payload.marketplace,
        keywords=payload.keywords,
        category_id=str(category_id) if category_id is not None else None,
        subcategory_id=subcategory_id,
        min_price=payload.min_price,
        max_price=payload.max_price,
        brand=payload.brand,
        condition=payload.condition,
        color=payload.color,
        size=payload.size,
        is_shippable=payload.is_shippable,
        latitude=payload.latitude,
        longitude=payload.longitude,
        distance_km=payload.distance_km,
        enabled=payload.enabled,
    )
    return {"ok": True, "id": filter_id}


@app.put("/api/filters/{filter_id}")
def api_update_filter(filter_id: int, payload: FilterUpdate) -> dict:
    category_id = _category_from_payload(payload)
    subcategory_id = _subcategory_from_payload(payload)
    update_filter(
        filter_id=filter_id,
        name=payload.name,
        marketplace=payload.marketplace,
        keywords=payload.keywords,
        category_id=str(category_id) if category_id is not None else None,
        subcategory_id=subcategory_id,
        min_price=payload.min_price,
        max_price=payload.max_price,
        brand=payload.brand,
        condition=payload.condition,
        color=payload.color,
        size=payload.size,
        is_shippable=payload.is_shippable,
        latitude=payload.latitude,
        longitude=payload.longitude,
        distance_km=payload.distance_km,
        enabled=payload.enabled,
    )
    return {"ok": True}


@app.post("/api/filters/{filter_id}/toggle")
def api_toggle_filter(filter_id: int) -> dict:
    rows = get_filters(enabled_only=False)
    row = next((r for r in rows if r["id"] == filter_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")
    new_state = not bool(row.get("enabled", False))
    set_filter_enabled(filter_id, new_state)
    return {"ok": True, "id": filter_id, "enabled": new_state}


@app.post("/api/filters/start_all")
def api_start_all_filters() -> dict:
    updated = set_all_filters_enabled(True)
    return {"ok": True, "updated": updated, "enabled": True}


@app.post("/api/filters/stop_all")
def api_stop_all_filters() -> dict:
    updated = set_all_filters_enabled(False)
    return {"ok": True, "updated": updated, "enabled": False}


@app.delete("/api/filters/{filter_id}")
def api_delete_filter(filter_id: int) -> dict:
    rows = get_filters(enabled_only=False)
    if not any(row["id"] == filter_id for row in rows):
        raise HTTPException(status_code=404, detail="Filter not found")
    delete_filter(filter_id)
    return {"ok": True}


@app.get("/api/items")
def api_get_items(limit: int = 100, offset: int = 0) -> list:
    return get_recent_items(limit=limit, offset=offset)


@app.get("/api/items/search")
def api_search_items(q: str, limit: int = 100, offset: int = 0) -> list:
    if not q.strip():
        return []
    return search_items(query=q, limit=limit, offset=offset)


@app.post("/api/items/reset")
def api_reset_items(reset_seen_items: bool = True) -> dict:
    stats = clear_items(reset_seen_items=bool(reset_seen_items))
    return {"ok": True, **stats}


# Compatibility aliases for previous clients.
@app.get("/filters")
def api_get_filters_compat() -> list:
    return api_get_filters()


@app.post("/filters")
def api_add_filter_compat(payload: FilterCreate) -> dict:
    return api_add_filter(payload)


@app.delete("/filters/{filter_id}")
def api_delete_filter_compat(filter_id: int) -> dict:
    return api_delete_filter(filter_id)


@app.get("/")
def ui_index(request: Request):
    if os.path.isfile(FRONTEND_INDEX_FILE):
        return FileResponse(FRONTEND_INDEX_FILE)

    rows = get_filters(enabled_only=False)
    items = get_recent_items(limit=100)
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "filters": rows,
            "items": items,
            "telegram_token_set": bool(os.getenv("TELEGRAM_TOKEN", "")),
            "telegram_chat_id_set": bool(os.getenv("TELEGRAM_CHAT_ID", "")),
        },
    )


@app.post("/ui/filters")
def ui_add_filter(
    marketplace: str = Form(...),
    name: str = Form(...),
    keywords: str = Form(""),
    category_id: str = Form(""),
    subcategory_id: str = Form(""),
    min_price: str = Form(""),
    max_price: str = Form(""),
    brand: str = Form(""),
    condition: str = Form(""),
    color: str = Form(""),
    size: str = Form(""),
    is_shippable: str = Form(""),
    latitude: str = Form(""),
    longitude: str = Form(""),
    distance_km: str = Form(""),
    enabled: str = Form("true"),
):
    add_filter(
        name=name.strip(),
        marketplace=marketplace.strip().lower(),
        keywords=keywords.strip(),
        category_id=category_id.strip() or None,
        subcategory_id=int(subcategory_id) if subcategory_id.strip() else None,
        min_price=float(min_price) if min_price.strip() else None,
        max_price=float(max_price) if max_price.strip() else None,
        brand=brand.strip() or None,
        condition=condition.strip() or None,
        color=color.strip() or None,
        size=size.strip() or None,
        is_shippable=True if is_shippable.strip() else None,
        latitude=float(latitude) if latitude.strip() else None,
        longitude=float(longitude) if longitude.strip() else None,
        distance_km=int(distance_km) if distance_km.strip() else None,
        enabled=str(enabled).lower() in {"1", "true", "on", "yes"},
    )
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/filters/{filter_id}/toggle")
def ui_toggle_filter(filter_id: int, enabled: str = Form("false")):
    set_filter_enabled(filter_id, str(enabled).lower() in {"1", "true", "on", "yes"})
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/filters/start_all")
def ui_start_all_filters():
    set_all_filters_enabled(True)
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/filters/stop_all")
def ui_stop_all_filters():
    set_all_filters_enabled(False)
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/filters/{filter_id}/edit")
def ui_edit_filter(
    filter_id: int,
    marketplace: str = Form(...),
    name: str = Form(...),
    keywords: str = Form(""),
    category_id: str = Form(""),
    subcategory_id: str = Form(""),
    min_price: str = Form(""),
    max_price: str = Form(""),
    brand: str = Form(""),
    condition: str = Form(""),
    color: str = Form(""),
    size: str = Form(""),
    is_shippable: str = Form(""),
    latitude: str = Form(""),
    longitude: str = Form(""),
    distance_km: str = Form(""),
    enabled: str = Form("true"),
):
    update_filter(
        filter_id=filter_id,
        name=name.strip(),
        marketplace=marketplace.strip().lower(),
        keywords=keywords.strip(),
        category_id=category_id.strip() or None,
        subcategory_id=int(subcategory_id) if subcategory_id.strip() else None,
        min_price=float(min_price) if min_price.strip() else None,
        max_price=float(max_price) if max_price.strip() else None,
        brand=brand.strip() or None,
        condition=condition.strip() or None,
        color=color.strip() or None,
        size=size.strip() or None,
        is_shippable=True if is_shippable.strip() else None,
        latitude=float(latitude) if latitude.strip() else None,
        longitude=float(longitude) if longitude.strip() else None,
        distance_km=int(distance_km) if distance_km.strip() else None,
        enabled=str(enabled).lower() in {"1", "true", "on", "yes"},
    )
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/filters/{filter_id}/delete")
def ui_delete_filter(filter_id: int):
    delete_filter(filter_id)
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/items/reset")
def ui_reset_items():
    clear_items(reset_seen_items=True)
    return RedirectResponse(url="/", status_code=303)
