from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.personalization import generate_personalized_suggestion

from app.routes.prediction import router as prediction_router
from app.routes.wards import router as wards_router

app = FastAPI(title="HeatGuard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://taapsurakshak-app.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PersonalizedSuggestionRequest(BaseModel):
    age: int
    heat_risk: float
    mortality_index: float


@app.post("/personalized-suggestion")
def personalized_suggestion(request: PersonalizedSuggestionRequest):
    return generate_personalized_suggestion(
        age=request.age,
        heat_risk=request.heat_risk,
        mortality_index=request.mortality_index
    )


@app.get("/")
def root():
    return {"message": "HeatGuard API is running"}


app.include_router(prediction_router)
app.include_router(wards_router)