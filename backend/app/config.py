import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = Path(os.getenv("SQLITE_DB_PATH", BACKEND_ROOT / "plasain.db"))
BASE_DISHES_PATH = BACKEND_ROOT / "dishes.json"
SESSION_DAYS = 30
DISH_UPLOADS_PATH = Path(os.getenv("DISH_UPLOADS_PATH", BACKEND_ROOT / "uploads" / "dishes"))
