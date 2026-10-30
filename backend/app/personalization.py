def generate_personalized_suggestion(
    age,
    heat_risk,
    mortality_index
):
    age = int(age)
    heat_risk = float(heat_risk)
    mortality_index = float(mortality_index)

    if age <= 5:
        age_factor = 1.25
        age_group = "young child"

    elif age <= 17:
        age_factor = 1.10
        age_group = "child or adolescent"

    elif age <= 59:
        age_factor = 1.00
        age_group = "adult"

    else:
        age_factor = 1.25
        age_group = "older adult"

    final_priority = (
        0.50 * heat_risk +
        0.50 * mortality_index
    ) * age_factor

    final_priority = min(final_priority, 100)

    if final_priority < 30:
        risk_level = "LOW"
        action = (
            "Stay hydrated and avoid unnecessary prolonged exposure "
            "to heat."
        )

    elif final_priority < 50:
        risk_level = "MODERATE"
        action = (
            "Drink water regularly, reduce prolonged heat exposure, "
            "and take breaks in a cool or shaded place."
        )

    elif final_priority < 70:
        risk_level = "HIGH"
        action = (
            "Reduce outdoor exposure during the hottest part of the day. "
            "Stay hydrated and remain in a cool place when possible."
        )

    elif final_priority < 85:
        risk_level = "VERY HIGH"
        action = (
            "Avoid unnecessary outdoor exposure. Stay in a cool or "
            "well-ventilated location and drink fluids regularly."
        )

    else:
        risk_level = "EXTREME"
        action = (
            "Avoid unnecessary outdoor exposure and move to a cooler "
            "location if needed. Stay hydrated and seek medical assistance "
            "if you become unwell."
        )

    message = (
        f"HEAT HEALTH ALERT — {risk_level}. "
        f"For this {age_group}: {action}"
    )

    return {
        "success": True,
        "message": message,
        "risk_level": risk_level,
        "priority": round(final_priority, 2),
        "age_group": age_group
    }