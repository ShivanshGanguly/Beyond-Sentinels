
const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");
const methodOverride = require("method-override");

require("dotenv").config({
    path: path.resolve(__dirname, ".env")
});

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const FASTAPI_URL =
    process.env.FASTAPI_URL || "http://127.0.0.1:8000";

const app = express();

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));

app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(path.join(__dirname, "images")));

app.use((req, res, next) => {
    res.locals.currentUser = "Beyond";
    res.locals.wardID = null;
    next();
});

app.get("/", (req, res) => {
    res.render("BeyondSentinel/risk", {
        userName: "Beyond"
    });
});


app.post("/api/generate-feedback", async (req, res) => {
    try {
        const { userPrompt } = req.body;

        if (!userPrompt) {
            return res.status(400).json({
                success: false,
                message: "userPrompt is required."
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: userPrompt
        });

        res.json({
            success: true,
            feedback: response.text
        });
    } catch (error) {
        console.error("Feedback generation error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to generate feedback via Gemini API."
        });
    }
});

app.post("/api/predict", async (req, res) => {
    try {
        console.log("Prediction request received:", req.body);

        const response = await fetch(`${FASTAPI_URL}/predict`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(req.body)
        });

        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = { detail: text };
        }

        return res.status(response.status).json(data);
    } catch (error) {
        console.error("/api/predict proxy error:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || String(error)
        });
    }
});

app.post("/api/predict/wards", async (req, res) => {
    try {
        console.log("Ward prediction request received:", req.body);

        const response = await fetch(`${FASTAPI_URL}/predict/wards`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(req.body)
        });

        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = { detail: text };
        }

        return res.status(response.status).json(data);
    } catch (error) {
        console.error("/api/predict/wards proxy error:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || String(error)
        });
    }
});

app.get("/api/latest-heat-data", async (req, res) => {
    try {
        const weatherResponse = await fetch(
            "https://api.open-meteo.com/v1/forecast" +
            "?latitude=19.0760" +
            "&longitude=72.8777" +
            "&daily=temperature_2m_max" +
            "&current=temperature_2m" +
            "&timezone=Asia%2FKolkata"
        );

        if (!weatherResponse.ok) {
            const errorBody = await weatherResponse.text();
            throw new Error(
                `Weather API returned ${weatherResponse.status}: ${errorBody}`
            );
        }

        const weatherData = await weatherResponse.json();

        const peakTemperature = Number(
            weatherData.daily?.temperature_2m_max?.[0]
        );

        if (!Number.isFinite(peakTemperature)) {
            throw new Error("Peak temperature not found from Weather API.");
        }

        const response = await fetch(`${FASTAPI_URL}/predict`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                temp_mean_c: 35,
                temp_max_c: peakTemperature,
                temp_min_c: 30,
                humidity_pct: 60,
                wind_speed_ms: 2,
                solar_radiation_kwh_m2: 5
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `FastAPI returned status ${response.status}: ${errorBody}`
            );
        }

        const result = await response.json();
        const prediction = result["3d"];

        if (!prediction) {
            throw new Error("3d prediction not found in FastAPI response.");
        }

        res.json({
            success: true,
            heatStress: Number(prediction.wbgt_c),
            mortalityRisk: Number(prediction.hmri),
            riskLevel: prediction.risk_level,
            temperature: peakTemperature,
            forecast: result
        });
    } catch (error) {
        console.error("Latest heat data error:", error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get("/api/wards", async (req, res) => {
    try {
        console.log("/api/wards request received");

        const response = await fetch(`${FASTAPI_URL}/wards`, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });

        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = { detail: text };
        }

        return res.status(response.status).json(data);
    } catch (error) {
        console.error("/api/wards proxy error:", error);

        return res.status(500).json({
            success: false,
            error: error?.message || String(error)
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
