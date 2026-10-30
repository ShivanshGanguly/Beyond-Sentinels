from fastapi import APIRouter

from app.schemas.prediction import WBGTInput
from app.services.prediction_service import generate_prediction
from app.services.ward_service import get_all_wards


router = APIRouter()


@router.get("/test")
def test_prediction():
    return {"message": "Prediction route is working"}


@router.post("/predict")
def predict(data: WBGTInput):
    prediction = generate_prediction(data)
    return prediction


@router.post("/predict/wards")
def predict_all_wards(data: WBGTInput):
    wards = get_all_wards()

    results = []

    for ward in wards:
        prediction = generate_prediction(
            data,
            vulnerability=ward["vulnerability"],
            exposure=ward["exposure"],
            ward_id=ward["ward_id"]
        )

        results.append({
            "ward_id": ward["ward_id"],
            "ward_name": ward["ward_name"],
            "population_2025": ward["population_2025"],
            "vulnerability": ward["vulnerability"],
            "exposure": ward["exposure"],
            "prediction": prediction
        })

    return results