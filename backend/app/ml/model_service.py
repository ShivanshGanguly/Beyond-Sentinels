import joblib
import pandas as pd

from app.ml.config import MODEL_PATHS


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


def load_models():
    models = {}

    for horizon, path in MODEL_PATHS.items():
        print(f"Loading {horizon} model from: {path}")
        models[horizon] = joblib.load(path)

    return models


def predict_wbgt(models, features):
    input_data = pd.DataFrame(
        [features],
        columns=FEATURE_COLUMNS
    )

    predictions = {}

    for horizon, model in models.items():
        prediction = model.predict(input_data)[0]



        predictions[horizon] = {
            "wbgt_c": float(prediction)
        }

    return predictions