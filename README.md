# Sniper Worker + API

Wallapop monitoring project with:
- Worker process (24/7 search + Telegram alerts)
- SQLite storage
- FastAPI server for filter management and a minimal web UI

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

The worker loads filters from SQLite table `filters` and deduplicates using `seen_items`.

## Run API Server

```
uvicorn app.api.server:app --reload
```

Open:
- http://127.0.0.1:8000/ for the minimal HTML interface
- http://127.0.0.1:8000/docs for Swagger

## API Endpoints

- `GET /filters`
- `POST /filters`
- `DELETE /filters/{id}`

Example `POST /filters` body:

```json
{
  "marketplace": "wallapop",
  "name": "cheap nike",
  "parameters": {
    "keyword": "nike",
    "max_price": 80
  }
}
```

## Minimal Web Interface

The root page (`/`) supports:
- viewing filters
- adding filters
- deleting filters

No styling is applied by design.