"""
logger.py
---------
Logging setup for the worker.
"""

import logging
import os
from datetime import datetime

_LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "logs")

_COLOURS = {
    "DEBUG": "\033[37m",
    "INFO": "\033[97m",
    "WARNING": "\033[93m",
    "ERROR": "\033[91m",
    "CRITICAL": "\033[41m",
    "RESET": "\033[0m",
}


class _ColouredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        colour = _COLOURS.get(record.levelname, "")
        reset = _COLOURS["RESET"]
        record.levelname = f"{colour}{record.levelname:<8}{reset}"
        return super().format(record)


def setup(log_to_file: bool = False, level: int = logging.INFO) -> None:
    fmt = "%(asctime)s  %(levelname)s  %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    handlers = []

    console = logging.StreamHandler()
    console.setFormatter(_ColouredFormatter(fmt=fmt, datefmt=datefmt))
    handlers.append(console)

    if log_to_file:
        os.makedirs(_LOG_DIR, exist_ok=True)
        log_path = os.path.join(_LOG_DIR, f"bot_{datetime.now().strftime('%Y%m%d')}.log")
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter(fmt=fmt, datefmt=datefmt))
        handlers.append(file_handler)

    logging.basicConfig(level=level, handlers=handlers, force=True)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
