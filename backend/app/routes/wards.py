from fastapi import APIRouter
from app.services.ward_service import get_all_wards

router = APIRouter()


@router.get("/wards")
def get_wards():
    return get_all_wards()