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
    "DEBUG": "\033[36m",
    "INFO": "\033[92m",
    "WARNING": "\033[93m",
    "ERROR": "\033[91m",
    "CRITICAL": "\033[41;97m",
    "DIM": "\033[90m",
    "BOLD": "\033[1m",
    "RESET": "\033[0m",
}

_LEVEL_SYMBOL = {
    "DEBUG": "[..]",
    "INFO": "[OK]",
    "WARNING": "[!!]",
    "ERROR": "[XX]",
    "CRITICAL": "[!!]",
}


class _ColouredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        colour = _COLOURS.get(record.levelname, "")
        reset = _COLOURS["RESET"]

        original_level = record.levelname
        symbol = _LEVEL_SYMBOL.get(original_level, "[--]")
        record.levelname = f"{colour}{symbol} {original_level:<8}{reset}"
        record.name = f"{_COLOURS['DIM']}{record.name}{reset}"

        if isinstance(record.msg, str):
            record.msg = record.msg.replace("[NEW_FILTER]", f"{_COLOURS['BOLD']}[NEW_FILTER]{reset}{colour}")
            record.msg = record.msg.replace("[NEW]", f"{_COLOURS['BOLD']}[NEW]{reset}{colour}")

        return super().format(record)


def setup(log_to_file: bool = False, level: int = logging.INFO) -> None:
    fmt = "%(asctime)s  %(levelname)s  %(name)s  %(message)s"
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
