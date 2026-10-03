import json
import os
from datetime import UTC, datetime
from typing import Any

import httpx

from app.database import get_connection


def local_plan(dishes: list[dict[str, Any]], goal: str) -> list[dict[str, Any]]:
    if goal == "High protein":
        dishes = sorted(dishes, key=lambda item: item.get("protein", 0), reverse=True)
    elif goal == "Plant-based":
        dishes = [dish for dish in dishes if dish.get("category") == "Plant-based"]
    elif goal == "Balanced":
        dishes = sorted(dishes, key=lambda item: abs(item.get("calories", 0) - 450))
    return dishes[:3]


def save_plan(goal: str, plan: dict[str, Any], user_id: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO plans (user_id, goal, meals_json, source, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, goal, json.dumps(plan["meals"], ensure_ascii=False), plan["source"], datetime.now(UTC).isoformat()),
        )


async def create_plan(dishes: list[dict[str, Any]], goal: str, user_id: str) -> dict[str, Any]:
    key = os.getenv("OPENROUTER_API_KEY")
    if key and dishes:
        prompt = ("Select exactly three distinct dish IDs for a one-day meal plan matching the goal. "
                  "Return only JSON in the form {\"ids\":[...]} using only supplied IDs. "
                  f"Goal: {goal}. Dishes: {json.dumps(dishes, ensure_ascii=False)}")
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                             "HTTP-Referer": os.getenv("APP_URL", "http://localhost:5173"), "X-Title": "Plasain"},
                    json={"model": os.getenv("OPENROUTER_MODEL", "openrouter/free"),
                          "messages": [{"role": "user", "content": prompt}], "temperature": 0.3,
                          "response_format": {"type": "json_object"}})
                response.raise_for_status()
                ids = json.loads(response.json()["choices"][0]["message"]["content"]).get("ids", [])
                by_id = {dish.get("id"): dish for dish in dishes}
                meals = [by_id[dish_id] for dish_id in ids if dish_id in by_id][:3]
                if meals:
                    result = {"meals": meals, "source": "openrouter"}
                    save_plan(goal, result, user_id)
                    return result
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass
    result = {"meals": local_plan(dishes, goal), "source": "local"}
    save_plan(goal, result, user_id)
    return result
