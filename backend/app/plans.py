import asyncio
import json
import os
import re
from datetime import UTC, datetime
from typing import Any

import httpx

from app.database import get_connection


def strip_safety_status(text: str) -> str:
    return re.sub(r"(?im)^\s*(?:user\s+)?safety\s*:\s*(?:safe|unsafe)\s*$", "", text)


def local_plan(dishes: list[dict[str, Any]], goal: str, prompt: str = "") -> list[dict[str, Any]]:
    request = f"{goal} {prompt}".lower()
    matches_vegan = "vegan" in request
    matches_plant_based = "plant-based" in request or "plant based" in request
    matches_high_protein = "high protein" in request or "protein" in request

    def has_tag(dish: dict[str, Any], tag: str) -> bool:
        labels = [dish.get("category", ""), *dish.get("tags", [])]
        return any(tag in str(label).lower() for label in labels)

    filtered = dishes
    if matches_vegan:
        vegan_dishes = [dish for dish in filtered if has_tag(dish, "vegan")]
        if vegan_dishes:
            filtered = vegan_dishes
    elif matches_plant_based or goal == "Plant-based":
        plant_based_dishes = [dish for dish in filtered if has_tag(dish, "plant") or has_tag(dish, "vegan")]
        if plant_based_dishes:
            filtered = plant_based_dishes

    if matches_high_protein or goal == "High protein":
        filtered = sorted(filtered, key=lambda item: item.get("protein", 0), reverse=True)
    elif goal == "Balanced":
        filtered = sorted(filtered, key=lambda item: abs(item.get("calories", 0) - 450))
    return filtered[:4]


def local_reply(meals: list[dict[str, Any]], prompt: str, language: str) -> str:
    if language == "vi":
        return f"Tôi đã tìm được {len(meals)} món phù hợp với yêu cầu của bạn."
    return f"I found {len(meals)} dishes that fit your request."


def save_plan(goal: str, plan: dict[str, Any], user_id: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO plans (user_id, goal, meals_json, source, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, goal, json.dumps(plan["meals"], ensure_ascii=False), plan["source"], datetime.now(UTC).isoformat()),
        )


async def create_plan(dishes: list[dict[str, Any]], goal: str, user_id: str, prompt: str = "", language: str = "en") -> dict[str, Any]:
    key = os.getenv("OPENROUTER_API_KEY")
    if key and dishes:
        request_prompt = ("You are a concise, supportive meal-planning assistant. Select exactly four distinct dish IDs "
                   "for a one-day meal plan matching the goal and the user's request. Return only JSON in the form "
                   "{\"ids\":[...],\"reply\":\"...\"} using only supplied IDs. "
                    f"Goal: {goal}. User request: {prompt or 'Create a balanced day.'}. "
                    f"Write the reply in {'Vietnamese' if language == 'vi' else 'English'}. "
                   f"Dishes: {json.dumps(dishes, ensure_ascii=False)}")
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                             "HTTP-Referer": os.getenv("APP_URL", "http://localhost:5173"), "X-Title": "Plasain"},
                    json={"model": os.getenv("OPENROUTER_MODEL", "openrouter/free"),
                           "messages": [{"role": "user", "content": request_prompt}], "temperature": 0.3,
                          "response_format": {"type": "json_object"}})
                response.raise_for_status()
                ai_response = json.loads(response.json()["choices"][0]["message"]["content"])
                ids = ai_response.get("ids", [])
                by_id = {dish.get("id"): dish for dish in dishes}
                meals = [by_id[dish_id] for dish_id in ids if dish_id in by_id][:4]
                if meals:
                    result = {"meals": meals, "source": "openrouter", "reply": ai_response.get("reply", "Here is a plan tailored to your request.")}
                    return result
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass
    meals = local_plan(dishes, goal, prompt)
    result = {"meals": meals, "source": "local", "reply": local_reply(meals, prompt, language)}
    save_plan(goal, result, user_id)
    return result


def sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_plan(dishes: list[dict[str, Any]], goal: str, user_id: str, prompt: str = "", language: str = "en"):
    """Stream the assistant's explanation, then send a validated meal plan event."""
    key = os.getenv("OPENROUTER_API_KEY")
    fallback = local_plan(dishes, goal, prompt)
    if not key or not dishes:
        reply = local_reply(fallback, prompt, language)
        yield sse("token", {"text": reply})
        yield sse("plan", {"meals": fallback, "source": "local", "reply": reply})
        return

    marker = "---PLAN_IDS---"
    prompt_text = (
        "You are a concise, supportive assistant. Answer every user request helpfully. When the request includes food or dietary preferences, choose dishes that specifically satisfy every dietary preference, "
        "nutrition target, cuisine, and meal type in the user's request. Reply in 1-3 short sentences that explicitly mention the "
        "user's requested constraints and why the selected dishes fit. Never give a generic balanced-plan response or say that you "
        "picked random dishes. "
        f"in {'Vietnamese' if language == 'vi' else 'English'}. Do not output safety labels or moderation status. Then output the exact marker {marker.strip()} "
        "on its own line, followed by a JSON array of exactly four distinct dish IDs. Do not mention the marker or IDs in the reply. "
        f"Goal: {goal}. User request: {prompt or 'Create a balanced day.'}. "
        f"Dishes: {json.dumps(dishes, ensure_ascii=False)}"
    )
    generated = ""
    pending = ""
    marker_seen = False
    try:
        async with asyncio.timeout(30):
            async with httpx.AsyncClient(timeout=20) as client:
                async with client.stream(
                    "POST", "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                             "HTTP-Referer": os.getenv("APP_URL", "http://localhost:5173"), "X-Title": "Plasain"},
                    json={"model": os.getenv("OPENROUTER_MODEL", "openrouter/free"), "stream": True,
                          "messages": [{"role": "user", "content": prompt_text}], "temperature": 0.3},
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        chunk = json.loads(line[6:])
                        text = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if not text:
                            continue
                        generated += text
                        if marker_seen:
                            continue
                        pending += text
                        marker_index = pending.find(marker)
                        if marker_index >= 0:
                            visible = pending[:marker_index]
                            visible = strip_safety_status(visible)
                            if visible:
                                yield sse("token", {"text": visible})
                            pending = ""
                            marker_seen = True
                        elif len(pending) > 32:
                            visible, pending = pending[:-32], pending[-32:]
                            visible = strip_safety_status(visible)
                            if visible:
                                yield sse("token", {"text": visible})
        if not marker_seen and pending:
            visible = strip_safety_status(pending)
            if visible:
                yield sse("token", {"text": visible})
        ids_match = generated.split(marker, 1)
        ids = json.loads(ids_match[1].strip()) if len(ids_match) == 2 else []
        by_id = {dish.get("id"): dish for dish in dishes}
        meals = [by_id[dish_id] for dish_id in ids if dish_id in by_id][:4] or fallback
        reply = strip_safety_status(ids_match[0]).strip() or local_reply(meals, prompt, language)
        yield sse("plan", {"meals": meals, "source": "openrouter", "reply": reply})
    except (asyncio.TimeoutError, httpx.HTTPError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        reply = local_reply(fallback, prompt, language)
        yield sse("token", {"text": reply})
        yield sse("plan", {"meals": fallback, "source": "local", "reply": reply})
