def calculate_hmri(wbgt, vulnerability, exposure):
    thermal_hazard = max(0, min((wbgt - 24) / 8, 1))

    risk_amplification = (
        0.50
        + 0.30 * vulnerability
        + 0.20 * exposure
    )

    hmri = thermal_hazard * risk_amplification * 100

    if hmri < 25:
        risk_level = "Low"
    elif hmri < 50:
        risk_level = "Medium"
    elif hmri < 75:
        risk_level = "Moderate"
    else:
        risk_level = "Extreme"

    return {
        "hmri": round(hmri, 2),
        "risk_level": risk_level
    }