# app/ml_model.py

import pandas as pd
import joblib

# Change these paths to your actual files
df = pd.read_csv("data/ward_ml_base.csv")

model = joblib.load("models/ward_priority_model.pkl")

features = [
    "temp_mean_c",
    "temp_max_c",
    "temp_min_c",
    "humidity_pct",
    "wind_speed_ms",
    "solar_radiation_kwh_m2"
]