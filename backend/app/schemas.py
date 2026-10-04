from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    goal: str = "Balanced"
    dishes: list[dict[str, Any]] = Field(default_factory=list)
    prompt: str = Field(default="", max_length=1_000)
    language: Literal["en", "vi"] = "en"


class PlanSaveRequest(BaseModel):
    goal: str = Field(default="Balanced", max_length=100)
    meals: list[dict[str, Any]] = Field(default_factory=list, max_length=12)
    plan_date: date = Field(default_factory=date.today)


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    password: str = Field(max_length=256)


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    height_cm: int | None = Field(default=None, ge=80, le=260)
    biological_sex: Literal["female", "male"] | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=date.today().year - 18)
    activity_level: float | None = Field(default=None, ge=1.1, le=2.5)
    avatar: str | None = Field(default=None, max_length=500_000)


class DishInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)
    calories: int = Field(ge=0, le=10000)
    protein: int = Field(ge=0, le=1000)
    carbs: int = Field(ge=0, le=1000)
    fat: int = Field(ge=0, le=1000)
    sodium_mg: int = Field(ge=0, le=20_000)
    # Either a short emoji or a backend-served image URL.
    image: str = Field(default="🍽️", min_length=1, max_length=500)
    description: str = Field(default="", max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=12)


class DishImageUpload(BaseModel):
    image: str = Field(min_length=1, max_length=1_500_000)


class DailyCheckIn(BaseModel):
    weight_kg: float = Field(ge=30, le=350)
    calories: float = Field(ge=500, le=10_000)
    protein_g: float = Field(ge=0, le=1_000)
    carbs_g: float = Field(ge=0, le=2_000)
    sodium_mg: float = Field(ge=0, le=20_000)


class RegressorRequest(BaseModel):
    height_cm: float = Field(ge=80, le=260)
    age_years: int = Field(ge=18, le=100)
    sex: Literal["female", "male"]
    pal: float = Field(ge=1.1, le=2.5)
    target_calories: float = Field(ge=800, le=4_500)
    check_ins: list[DailyCheckIn] = Field(min_length=7, max_length=60)
