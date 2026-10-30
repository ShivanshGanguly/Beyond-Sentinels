import pandas as pd


CSV_PATH = "data/mumbai_ward_vulnerability_data.csv"


WARD_COORDS = {
    1: ("A", 18.9320, 72.8347),
    2: ("B", 18.9550, 72.8350),
    3: ("C", 18.9470, 72.8310),
    4: ("D", 18.9560, 72.8150),
    5: ("E", 18.9790, 72.8340),
    6: ("F_South", 19.0030, 72.8420),
    7: ("F_North", 19.0180, 72.8560),
    8: ("G_South", 19.0050, 72.8250),
    9: ("G_North", 19.0170, 72.8470),
    10: ("H_West", 19.0540, 72.8260),
    11: ("H_East", 19.0650, 72.8430),
    12: ("K_West", 19.1190, 72.8460),
    13: ("K_East", 19.1130, 72.8670),
    14: ("L", 19.0720, 72.8820),
    15: ("M_West", 19.0630, 72.8950),
    16: ("M_East", 19.0450, 72.9100),
    17: ("N", 19.0860, 72.9080),
    18: ("P_South", 19.1650, 72.8500),
    19: ("P_North", 19.1870, 72.8350),
    20: ("R_South", 19.2100, 72.8500),
    21: ("R_Central", 19.2300, 72.8570),
    22: ("R_North", 19.2450, 72.8500),
    23: ("S", 19.1300, 72.9050),
    24: ("T", 19.1750, 72.9250),
}


VULNERABILITY_COLUMNS = [
    "population_density_category",
    "household_density_category",
    "socially_weaker_section_category",
]


EXPOSURE_COLUMNS = [
    "marginal_workers_category",
    "illiteracy_rate_category",
    "dilapidated_household_category",
    "no_electric_connection_category",
    "untreated_water_quality_category",
    "distant_water_source_category",
]


def load_ward_data():
    return pd.read_csv(CSV_PATH)


def get_ward_risk_factors(ward_id):
    df = load_ward_data()

    ward = df[df["ward_id"] == ward_id]

    if ward.empty:
        raise ValueError(f"Ward {ward_id} not found")

    ward = ward.iloc[0]

    vulnerability = (
        ward[VULNERABILITY_COLUMNS]
        .astype(float)
        .sub(1)
        .div(4)
        .mean()
    )

    exposure = (
        ward[EXPOSURE_COLUMNS]
        .astype(float)
        .sub(1)
        .div(4)
        .mean()
    )

    ward_id = int(ward["ward_id"])

    coords = WARD_COORDS.get(ward_id)

    return {
        "ward_id": ward_id,
        "ward_name": ward["ward_name"],
        "population_2025": int(ward["population_2025"]),
        "vulnerability": float(vulnerability),
        "exposure": float(exposure),
        "latitude": coords[1] if coords else None,
        "longitude": coords[2] if coords else None,
    }


def get_all_wards():
    df = load_ward_data()

    wards = []

    for _, ward in df.iterrows():

        vulnerability = (
            ward[VULNERABILITY_COLUMNS]
            .astype(float)
            .sub(1)
            .div(4)
            .mean()
        )

        exposure = (
            ward[EXPOSURE_COLUMNS]
            .astype(float)
            .sub(1)
            .div(4)
            .mean()
        )

        ward_id = int(ward["ward_id"])

        coords = WARD_COORDS.get(ward_id)

        wards.append({
            "ward_id": ward_id,
            "ward_name": ward["ward_name"],
            "population_2025": int(ward["population_2025"]),
            "vulnerability": float(vulnerability),
            "exposure": float(exposure),
            "latitude": coords[1] if coords else None,
            "longitude": coords[2] if coords else None,
        })

    return wards