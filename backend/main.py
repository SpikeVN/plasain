import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import BACKEND_ROOT
from app.database import initialize_database
from app.routers import auth, dishes, plans


@asynccontextmanager
async def lifespan(_: FastAPI):
    (BACKEND_ROOT / "uploads" / "dishes").mkdir(parents=True, exist_ok=True)
    initialize_database()
    yield


app = FastAPI(title="Plasain Meal Planner", version="1.0.0", lifespan=lifespan)
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dishes.router)
app.include_router(plans.router)
app.mount("/uploads", StaticFiles(directory=BACKEND_ROOT / "uploads", check_dir=False), name="uploads")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
