from typing import Any, Literal

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    goal: str = "Balanced"
    dishes: list[dict[str, Any]] = Field(default_factory=list)


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    password: str = Field(max_length=256)


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    height_cm: int | None = Field(default=None, ge=80, le=260)
    biological_sex: Literal["female", "male"] | None = None
    avatar: str | None = Field(default=None, max_length=500_000)


class DishInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)
    calories: int = Field(ge=0, le=10000)
    protein: int = Field(ge=0, le=1000)
    carbs: int = Field(ge=0, le=1000)
    fat: int = Field(ge=0, le=1000)
    # Either a short emoji or a backend-served image URL.
    image: str = Field(default="🍽️", min_length=1, max_length=500)
    description: str = Field(default="", max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=12)


class DishImageUpload(BaseModel):
    image: str = Field(min_length=1, max_length=1_500_000)
