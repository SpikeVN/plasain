from fastapi import APIRouter

from app.regressor import analyse_check_ins
from app.schemas import RegressorRequest

router = APIRouter(prefix="/api/regressor", tags=["regressor"])


@router.post("/project")
async def project(request: RegressorRequest) -> dict[str, object]:
    return analyse_check_ins(
        [check_in.model_dump() for check_in in request.check_ins],
        request.height_cm, request.age_years, request.sex, request.pal, request.target_calories,
    )
