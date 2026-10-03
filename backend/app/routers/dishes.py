import base64
import binascii
import sqlite3
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import DISH_UPLOADS_PATH
from app.dishes import add_dish, base_dishes, delete_dish, dishes_for_user, update_dish
from app.schemas import DishImageUpload, DishInput
from app.security import require_user, user_for_token

router = APIRouter(prefix="/api/dishes", tags=["dishes"])


@router.post("/image")
async def upload_dish_image(payload: DishImageUpload, user: sqlite3.Row = Depends(require_user)) -> dict[str, str]:
    prefix = "data:image/jpeg;base64,"
    if not payload.image.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Upload a JPEG image.")
    try:
        image = base64.b64decode(payload.image[len(prefix):], validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid image data.") from None
    if len(image) > 1_000_000:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large.")
    if not image.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid JPEG image.")
    DISH_UPLOADS_PATH.mkdir(parents=True, exist_ok=True)
    filename = f"{user['id']}-{uuid4().hex}.jpg"
    (DISH_UPLOADS_PATH / filename).write_bytes(image)
    return {"image": f"/uploads/dishes/{filename}"}


@router.get("")
async def list_dishes(authorization: str | None = Header(default=None)) -> dict[str, list[dict[str, object]]]:
    user = user_for_token(authorization)
    dishes = base_dishes()
    if user:
        dishes.extend(dishes_for_user(user["id"]))
    return {"dishes": dishes}


@router.post("")
async def create_dish(dish: DishInput, user: sqlite3.Row = Depends(require_user)) -> dict[str, object]:
    return {"dish": add_dish(user["id"], dish)}


@router.put("/{dish_id}")
async def edit_dish(dish_id: str, dish: DishInput, user: sqlite3.Row = Depends(require_user)) -> dict[str, object]:
    updated = update_dish(user["id"], dish_id, dish)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dish not found.")
    return {"dish": updated}


@router.delete("/{dish_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_dish(dish_id: str, user: sqlite3.Row = Depends(require_user)) -> None:
    if not delete_dish(user["id"], dish_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dish not found.")
