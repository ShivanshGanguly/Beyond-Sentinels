from pathlib import Path

import pandas as pd
import xgboost as xgb


BASE_DIR = Path(__file__).resolve().parent.parent

MODEL_FILE = BASE_DIR / "ml" / "models" / "xgb_wbgt_5d.json"
FEATURES_FILE = BASE_DIR / "data" / "ward_ml_features.csv"

FEATURE_COLUMNS = [
    "temp_mean_c",
    "temp_max_c",
    "temp_min_c",
    "humidity_pct",
    "wind_speed_ms",
    "solar_radiation_kwh_m2",
    "heat_index_c",
    "wbgt_c",
    "utci_c",
    "temperature_anomaly_c",
    "temp_lag_1d",
    "temp_lag_3d",
    "temp_lag_7d",
    "humidity_lag_1d",
    "humidity_lag_3d",
    "humidity_lag_7d",
]


model = xgb.XGBRegressor()
model.load_model(str(MODEL_FILE))


def get_model_predictions(ward_id: int | None = None):
    df = pd.read_csv(FEATURES_FILE)

    if ward_id is not None:
        df = df[df["ward_id"] == ward_id]

    if df.empty:
        return []

    X = df[FEATURE_COLUMNS]
    predictions = model.predict(X)

    df = df.copy()
    df["predicted_wbgt_5d"] = predictions

    return df[
        ["date", "ward_id", "ward_name", "wbgt_c", "predicted_wbgt_5d"]
    ].to_dict(orient="records")