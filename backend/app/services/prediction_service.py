import pandas as pd
import numpy as np

from app.ml.model_service import load_models, predict_wbgt
from app.services.risk_service import calculate_hmri


models = load_models()

DATA_PATH = "data/ward_ml_base.csv"


def calculate_heat_index(T, RH):
    T_f = T * 9 / 5 + 32

    HI_f = (
        0.5
        * (
            T_f
            + 61.0
            + ((T_f - 68.0) * 1.2)
            + (RH * 0.094)
        )
    )

    HI_roth_f = (
        -42.379
        + 2.04901523 * T_f
        + 10.14333127 * RH
        - 0.22475541 * T_f * RH
        - 0.00683783 * T_f**2
        - 0.05481717 * RH**2
        + 0.00122874 * T_f**2 * RH
        + 0.00085282 * T_f * RH**2
        - 0.00000199 * T_f**2 * RH**2
    )

    use_roth = (T_f >= 80) & (RH >= 40)

    HI_f = np.where(use_roth, HI_roth_f, HI_f)

    return (HI_f - 32) * 5 / 9


def wet_bulb_stull(T, RH):
    return (
        T * np.arctan(
            0.151977 * np.sqrt(RH + 8.313659)
        )
        + np.arctan(T + RH)
        - np.arctan(RH - 1.676331)
        + 0.00391838
        * RH**1.5
        * np.arctan(0.023101 * RH)
        - 4.686035
    )


def create_features(df):

    df = df.copy()

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(
        ["ward_id", "date"]
    ).reset_index(drop=True)

    # Heat index
    df["heat_index_c"] = calculate_heat_index(
        df["temp_mean_c"],
        df["humidity_pct"]
    )

    # Wet bulb
    df["wet_bulb_c"] = wet_bulb_stull(
        df["temp_mean_c"],
        df["humidity_pct"]
    )

    # Globe temperature
    solar = df["solar_radiation_kwh_m2"].clip(lower=0)

    df["globe_temp_c"] = (
        df["temp_mean_c"]
        + 0.15 * solar
    )

    # WBGT
    df["wbgt_c"] = (
        0.7 * df["wet_bulb_c"]
        + 0.2 * df["globe_temp_c"]
        + 0.1 * df["temp_mean_c"]
    )

    # UTCI
    T = df["temp_mean_c"]
    RH = df["humidity_pct"]
    WS = df["wind_speed_ms"]

    vapor_pressure = (
        RH / 100
        * 6.105
        * np.exp(
            (17.27 * T)
            / (237.7 + T)
        )
    )

    df["utci_c"] = (
        T
        + 0.33 * vapor_pressure
        - 0.70 * WS
        - 4.0
    )

    # Monthly baseline
    df["month"] = df["date"].dt.month

    baseline = (
        df[df["date"].dt.year <= 2023]
        .groupby(
            ["ward_id", "month"]
        )["temp_mean_c"]
        .mean()
        .rename("monthly_temp_baseline")
        .reset_index()
    )

    df = df.merge(
        baseline,
        on=["ward_id", "month"],
        how="left"
    )

    # Temperature anomaly
    df["temperature_anomaly_c"] = (
        df["temp_mean_c"]
        - df["monthly_temp_baseline"]
    )

    # Historical lag features
    grouped = df.groupby("ward_id")

    df["temp_lag_1d"] = (
        grouped["temp_mean_c"].shift(1)
    )

    df["temp_lag_3d"] = (
        grouped["temp_mean_c"].shift(3)
    )

    df["temp_lag_7d"] = (
        grouped["temp_mean_c"].shift(7)
    )

    df["humidity_lag_1d"] = (
        grouped["humidity_pct"].shift(1)
    )

    df["humidity_lag_3d"] = (
        grouped["humidity_pct"].shift(3)
    )

    df["humidity_lag_7d"] = (
        grouped["humidity_pct"].shift(7)
    )

    return df


def generate_prediction(
    data,
    vulnerability=0.5,
    exposure=0.5,
    ward_id=None
):

    # Load real weather dataset
    df = pd.read_csv(DATA_PATH)

    features_df = create_features(df)

    # Use the latest available date
    latest_date = features_df["date"].max()

    latest = features_df[
        features_df["date"] == latest_date
    ]
    if ward_id is not None:
        latest = latest[
            latest["ward_id"] == ward_id
        ]

        if latest.empty:
            raise ValueError(
                f"Ward {ward_id} not found for latest date"
            )
        # Use the latest available row for this prediction
    latest = latest.iloc[0].copy()

    features = [
        latest["temp_mean_c"],
        latest["temp_max_c"],
        latest["temp_min_c"],
        latest["humidity_pct"],
        latest["wind_speed_ms"],
        latest["solar_radiation_kwh_m2"],
        latest["heat_index_c"],
        latest["wbgt_c"],
        latest["utci_c"],
        latest["temperature_anomaly_c"],
        latest["temp_lag_1d"],
        latest["temp_lag_3d"],
        latest["temp_lag_7d"],
        latest["humidity_lag_1d"],
        latest["humidity_lag_3d"],
        latest["humidity_lag_7d"],
    ]

    predictions = predict_wbgt(
        models,
        features
    )

    for horizon in predictions:

        predictions[horizon].update(
            calculate_hmri(
                predictions[horizon]["wbgt_c"],
                vulnerability,
                exposure,
                
            )
        )

    return predictions