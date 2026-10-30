import pandas as pd
from pathlib import Path


# Find the backend folder
BASE_DIR = Path(__file__).resolve().parent.parent

# Path to the ML dataset
DATA_PATH = BASE_DIR / "data" / "ward_ml_base.csv"


def load_ward_data():
    """Load the ward-level weather dataset."""
    df = pd.read_csv(DATA_PATH)

    # Convert date column to datetime
    df["date"] = pd.to_datetime(df["date"])

    return df


def get_wards():
    """Return all available wards."""
    df = load_ward_data()

    wards = (
        df[["ward_id", "ward_name"]]
        .drop_duplicates()
        .sort_values("ward_id")
    )

    return wards.to_dict(orient="records")