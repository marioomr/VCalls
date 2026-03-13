"""Compatibility launcher for the worker entrypoint.

Use:
    python main.py

Preferred:
    python -m app.worker
"""

from app.worker import main


if __name__ == "__main__":
    main()
