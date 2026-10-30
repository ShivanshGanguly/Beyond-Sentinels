from pathlib import Path
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

app = FastAPI(
    title="Cool Block Commander",
    description="Heatwave Decision Support System",
    version="1.0.0",
)

DATA_DIR = Path(__file__).resolve().parent / "data"

DATA_FILE = DATA_DIR / "mumbai_heatshield_backend_output.csv"
HMRI_FILE = DATA_DIR / "mumbai_operational_hmri.csv"
ACTION_HISTORY_FILE = DATA_DIR / "mumbai_heatshield_action_history.csv"


@app.get("/")
def home():
    return {"message": "Cool Block Commander Backend Running"}


@app.get("/ml-predictions")
def get_ml_predictions(
    ward_id: int | None = Query(default=None, ge=1),
):
    try:
        if not DATA_FILE.exists():
            raise HTTPException(
                status_code=500,
                detail="Final backend output file was not found.",
            )

        df = pd.read_csv(DATA_FILE)

        if ward_id is not None:
            df = df[df["ward_id"] == ward_id]

        return {
            "count": len(df),
            "forecast_type": "operational_heatshield_output",
            "predictions": df.to_dict(orient="records"),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load operational predictions: {exc}",
        ) from exc


@app.get("/heat-risk")
def get_heat_risk(
    ward_id: int | None = Query(default=None, ge=1),
):
    try:
        if not HMRI_FILE.exists():
            raise HTTPException(
                status_code=500,
                detail="Heat-risk data file was not found.",
            )

        df = pd.read_csv(HMRI_FILE)

        if ward_id is not None:
            df = df[df["ward_id"] == ward_id]

        return {
            "count": len(df),
            "heat_risk": df.to_dict(orient="records"),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load heat-risk data: {exc}",
        ) from exc


@app.get("/action-history")
def get_action_history(
    ward_id: int | None = Query(default=None, ge=1),
    status: str | None = Query(default=None),
):
    try:
        if not ACTION_HISTORY_FILE.exists():
            raise HTTPException(
                status_code=500,
                detail="Action history file was not found.",
            )

        df = pd.read_csv(ACTION_HISTORY_FILE)

        if ward_id is not None:
            df = df[df["ward_id"] == ward_id]

        if status is not None:
            df = df[
                df["status"].astype(str).str.lower()
                == status.lower()
            ]

        return {
            "count": len(df),
            "action_history": df.to_dict(orient="records"),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load action history: {exc}",
        ) from exc