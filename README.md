# Sniper Worker + API

Marketplace monitoring project (currently Wallapop) with:
- Worker process (24/7 search + Telegram alerts)
- SQLite storage for filters, seen items, and item history
- FastAPI backend + web GUI (filters/items tabs)

## Environment Variables

Create a `.env` file in project root with:

```
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
CHECK_INTERVAL=30
```

Loaded via `python-dotenv` in both worker and API server.

## Install

```
pip install -r requirements.txt
```

## Run Worker

```
python app/worker.py
```

The worker loads enabled filters from SQLite (`filters`), seeds first-run items into `seen_items` without notifications, and then only alerts on brand-new items.

## Run API Server

```
uvicorn app.api.server:app --reload
```

Open:
- http://127.0.0.1:8000/ for the minimal HTML interface
- http://127.0.0.1:8000/docs for Swagger

## API Endpoints

- `GET /api/filters`
- `POST /api/filters`
- `PUT /api/filters/{id}`
- `POST /api/filters/{id}/toggle`
- `DELETE /api/filters/{id}`
- `POST /api/filters/start_all`
- `POST /api/filters/stop_all`
- `GET /api/items`
- `GET /api/items/search?q=`

Example `POST /api/filters` body:

```json
{
  "name": "cheap nike",
  "marketplace": "wallapop",
  "keywords": "nike",
  "category_id": "12465",
  "min_price": 10,
  "max_price": 80,
  "enabled": true
}
```

## Web Interface

- Tab `Filtros`: list, add, edit (modal), delete, toggle enabled/play/pause, start all, stop all
- Tab `Items`: latest detected items ordered by `detected_at DESC` + title search

## Database

SQLite file: `data/sniper.db`

Tables:
- `filters` (`id`, `name`, `marketplace`, `keywords`, `category_id`, `min_price`, `max_price`, `enabled`, `created_at`)
- `items` (`id`, `item_id` UNIQUE, `title`, `price`, `city`, `marketplace`, `url`, `created_at`, `detected_at`, `filter_id`)
- `seen_items` (`item_id`, `filter_id`, `first_seen_at`)

Legacy `data/seen*.json` files are no longer used.
```
VCalls
├─ README.md
├─ app
│  ├─ __init__.py
│  ├─ api
│  │  ├─ __init__.py
│  │  ├─ server.py
│  │  └─ templates
│  │     └─ index.html
│  ├─ core
│  │  ├─ __init__.py
│  │  ├─ filters.py
│  │  ├─ logger.py
│  │  ├─ scheduler.py
│  │  └─ search_worker.py
│  ├─ services
│  │  ├─ __init__.py
│  │  ├─ marketplaces
│  │  │  ├─ __init__.py
│  │  │  ├─ base_marketplace.py
│  │  │  ├─ wallapop_browser.py
│  │  │  └─ wallapop_service.py
│  │  └─ telegram.py
│  ├─ storage
│  │  ├─ __init__.py
│  │  └─ database.py
│  └─ worker.py
├─ config
│  └─ products.json
├─ data
│  ├─ sniper.db
│  ├─ sniper.db-shm
│  └─ sniper.db-wal
├─ main.py
├─ package-lock.json
└─ requirements.txt

```