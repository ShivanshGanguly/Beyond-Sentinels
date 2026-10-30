import time
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import requests
WARD_COORDS = {
    1:  ("A",         18.9320, 72.8347),
    2:  ("B",         18.9550, 72.8350),
    3:  ("C",         18.9470, 72.8310),
    4:  ("D",         18.9560, 72.8150),
    5:  ("E",         18.9790, 72.8340),
    6:  ("F_South",   19.0030, 72.8420),
    7:  ("F_North",   19.0180, 72.8560),
    8:  ("G_South",   19.0050, 72.8250),
    9:  ("G_North",   19.0170, 72.8470),
    10: ("H_West",    19.0540, 72.8260),
    11: ("H_East",    19.0650, 72.8430),
    12: ("K_West",    19.1190, 72.8460),
    13: ("K_East",    19.1130, 72.8670),
    14: ("L",         19.0720, 72.8820),
    15: ("M_West",    19.0630, 72.8950),
    16: ("M_East",    19.0450, 72.9100),
    17: ("N",         19.0860, 72.9080),
    18: ("P_South",   19.1650, 72.8500),
    19: ("P_North",   19.1870, 72.8350),
    20: ("R_South",   19.2100, 72.8500),
    21: ("R_Central", 19.2300, 72.8570),
    22: ("R_North",   19.2450, 72.8500),
    23: ("S",         19.1300, 72.9050),
    24: ("T",         19.1750, 72.9250),
}
def fetch_weather_for_day(date_str: str) -> pd.DataFrame:
    """Fetch historical daily weather for all configured wards."""
    rows = []

    for ward_id, (ward_name, lat, lon) in WARD_COORDS.items():
        url = "https://archive-api.open-meteo.com/v1/archive"

        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": date_str,
            "end_date": date_str,
            "daily": [
                "temperature_2m_mean",
                "temperature_2m_max",
                "temperature_2m_min",
                "relative_humidity_2m_mean",
                "wind_speed_10m_mean",
                "shortwave_radiation_sum",
            ],
            "timezone": "Asia/Kolkata",
        }

        for attempt in range(5):
            try:
                response = requests.get(
                    url,
                    params=params,
                    timeout=30,
                )

                if response.status_code == 200:
                    daily = response.json()["daily"]

                    rows.append({
                        "date": date_str,
                        "temp_mean_c": daily["temperature_2m_mean"][0],
                        "temp_max_c": daily["temperature_2m_max"][0],
                        "temp_min_c": daily["temperature_2m_min"][0],
                        "humidity_pct": daily["relative_humidity_2m_mean"][0],
                        "wind_speed_ms": daily["wind_speed_10m_mean"][0],
                        "solar_radiation_kwh_m2": daily["shortwave_radiation_sum"][0],
                        "ward_id": ward_id,
                        "ward_name": ward_name,
                    })
                    break

                if response.status_code == 429:
                    wait = 10 * (attempt + 1)
                    print(f"Rate limited for {ward_name}; retrying in {wait}s.")
                    time.sleep(wait)
                else:
                    print(f"Weather request failed for {ward_name}: HTTP {response.status_code}")
                    break

            except (requests.RequestException, KeyError, IndexError, TypeError) as exc:
                print(f"Weather request error for {ward_name}: {exc}")
                if attempt < 4:
                    time.sleep(5)

        time.sleep(0.5)

    return pd.DataFrame(rows)
def calculate_heat_index(T, RH):
    """Calculate heat index in Celsius from temperature and relative humidity."""
    T_f = T * 9 / 5 + 32

    HI_f = 0.5 * (
        T_f + 61.0 + ((T_f - 68.0) * 1.2) + (RH * 0.094)
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
    """Estimate wet-bulb temperature using the Stull approximation."""
    return (
        T * np.arctan(0.151977 * np.sqrt(RH + 8.313659))
        + np.arctan(T + RH)
        - np.arctan(RH - 1.676331)
        + 0.00391838 * RH**1.5
        * np.arctan(0.023101 * RH)
        - 4.686035
    )


