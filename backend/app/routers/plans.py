import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.database import get_connection
from app.plans import create_plan, stream_plan, save_plan
from app.schemas import PlanRequest, PlanSaveRequest
from app.dishes import base_dishes, dishes_for_user
from app.security import require_user

router = APIRouter(prefix="/api", tags=["plans"])


@router.post("/plan")
async def plan(request: PlanRequest, user: sqlite3.Row = Depends(require_user)) -> dict[str, Any]:
    catalog = base_dishes() + dishes_for_user(user["id"])
    allowed = {dish["id"]: dish for dish in catalog}
    requested_ids = [dish.get("id") for dish in request.dishes]
    dishes = [allowed[dish_id] for dish_id in requested_ids if dish_id in allowed] if requested_ids else catalog
    return await create_plan(dishes[:100], request.goal, user["id"], request.prompt, request.language)


@router.post("/plan/stream")
async def plan_stream(request: PlanRequest, user: sqlite3.Row = Depends(require_user)) -> StreamingResponse:
    catalog = base_dishes() + dishes_for_user(user["id"])
    allowed = {dish["id"]: dish for dish in catalog}
    requested_ids = [dish.get("id") for dish in request.dishes]
    dishes = [allowed[dish_id] for dish_id in requested_ids if dish_id in allowed] if requested_ids else catalog
    return StreamingResponse(
        stream_plan(dishes[:100], request.goal, user["id"], request.prompt, request.language),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/plans")
async def save_manual_plan(request: PlanSaveRequest, user: sqlite3.Row = Depends(require_user)) -> dict[str, Any]:
    catalog = base_dishes() + dishes_for_user(user["id"])
    allowed = {dish["id"]: dish for dish in catalog}
    meal_ids = (meal.get("id") for meal in request.meals)
    meals = [allowed[meal_id] for meal_id in meal_ids if meal_id in allowed]
    result = {"meals": meals, "source": "manual"}
    save_plan(request.goal, result, user["id"])
    return result


@router.get("/plans")
async def list_plans(user: sqlite3.Row = Depends(require_user)) -> dict[str, list[dict[str, Any]]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, goal, meals_json, source, created_at FROM plans WHERE user_id = ? ORDER BY id DESC LIMIT 50", (user["id"],)
        ).fetchall()
    return {"plans": [
        {"id": row["id"], "goal": row["goal"], "meals": json.loads(row["meals_json"]),
         "source": row["source"], "created_at": row["created_at"]}
        for row in rows
    ]}
