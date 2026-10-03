import json
import sqlite3
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.config import BASE_DISHES_PATH
from app.database import get_connection
from app.schemas import DishInput


def base_dishes() -> list[dict[str, Any]]:
    return json.loads(BASE_DISHES_PATH.read_text(encoding="utf-8"))


def dishes_for_user(user_id: str) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, name, category, calories, protein, carbs, fat, image, description, tags_json FROM user_dishes WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    dishes = []
    for row in rows:
        dish = dict(row)
        dish["tags"] = json.loads(dish.pop("tags_json") or "[]")
        dishes.append(dish)
    return dishes


def add_dish(user_id: str, dish: DishInput) -> dict[str, Any]:
    saved = {"id": f"user-{user_id}-{uuid4().hex}", **dish.model_dump()}
    with get_connection() as connection:
        connection.execute(
            """INSERT INTO user_dishes
                (id, user_id, name, category, calories, protein, carbs, fat, image, description, tags_json, created_at)
                VALUES (:id, :user_id, :name, :category, :calories, :protein, :carbs, :fat, :image, :description, :tags_json, :created_at)""",
             {**saved, "tags_json": json.dumps(saved["tags"]), "user_id": user_id, "created_at": datetime.now(UTC).isoformat()},
        )
    return saved


def update_dish(user_id: str, dish_id: str, dish: DishInput) -> dict[str, Any] | None:
    saved = {"id": dish_id, **dish.model_dump()}
    with get_connection() as connection:
        result = connection.execute(
            """UPDATE user_dishes SET name = :name, category = :category, calories = :calories,
                protein = :protein, carbs = :carbs, fat = :fat, image = :image,
                description = :description, tags_json = :tags_json WHERE id = :id AND user_id = :user_id""",
            {**saved, "tags_json": json.dumps(saved["tags"]), "user_id": user_id},
        )
    return saved if result.rowcount else None


def delete_dish(user_id: str, dish_id: str) -> bool:
    with get_connection() as connection:
        result = connection.execute("DELETE FROM user_dishes WHERE id = ? AND user_id = ?", (dish_id, user_id))
    return bool(result.rowcount)
