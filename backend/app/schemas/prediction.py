from pydantic import BaseModel


class WBGTInput(BaseModel):
    temp_mean_c: float
    temp_max_c: float
    temp_min_c: float
    humidity_pct: float
    wind_speed_ms: float
    solar_radiation_kwh_m2: float