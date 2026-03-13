import json
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.storage.database import add_filter, delete_filter, get_filters, init_db

load_dotenv()

app = FastAPI(title="Sniper API", version="1.0.0")
templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))


class FilterCreate(BaseModel):
    marketplace: str = Field(..., examples=["wallapop"])
    name: str = Field(..., examples=["cheap nike"])
    parameters: Dict[str, Any] = Field(default_factory=dict, examples=[{"keyword": "nike", "max_price": 80}])
    enabled: bool = True


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/filters")
def api_get_filters() -> list:
    return get_filters(enabled_only=False)


@app.post("/filters")
def api_add_filter(payload: FilterCreate) -> dict:
    filter_id = add_filter(
        marketplace=payload.marketplace,
        name=payload.name,
        parameters=payload.parameters,
        enabled=payload.enabled,
    )
    return {"ok": True, "id": filter_id}


@app.delete("/filters/{filter_id}")
def api_delete_filter(filter_id: int) -> dict:
    rows = get_filters(enabled_only=False)
    if not any(row["id"] == filter_id for row in rows):
        raise HTTPException(status_code=404, detail="Filter not found")
    delete_filter(filter_id)
    return {"ok": True}


@app.get("/")
def ui_index(request: Request):
    rows = get_filters(enabled_only=False)
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "filters": rows,
            "telegram_token_set": bool(os.getenv("TELEGRAM_TOKEN", "")),
            "telegram_chat_id_set": bool(os.getenv("TELEGRAM_CHAT_ID", "")),
        },
    )


@app.post("/ui/filters")
def ui_add_filter(
    marketplace: str = Form(...),
    name: str = Form(...),
    parameters_json: str = Form("{}"),
    enabled: str = Form("true"),
):
    try:
        parameters = json.loads(parameters_json or "{}")
        if not isinstance(parameters, dict):
            raise ValueError("parameters_json must be a JSON object")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameters JSON: {e}")

    add_filter(
        marketplace=marketplace.strip().lower(),
        name=name.strip(),
        parameters=parameters,
        enabled=str(enabled).lower() in {"1", "true", "on", "yes"},
    )
    return RedirectResponse(url="/", status_code=303)


@app.post("/ui/filters/{filter_id}/delete")
def ui_delete_filter(filter_id: int):
    delete_filter(filter_id)
    return RedirectResponse(url="/", status_code=303)
