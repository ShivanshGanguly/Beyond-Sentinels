const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");
const methodOverride = require("method-override");

// =====================================================
// ENVIRONMENT CONFIGURATION
// =====================================================

require("dotenv").config({
    path: path.resolve(__dirname, ".env")
});

const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;

const FASTAPI_URL = (
    process.env.FASTAPI_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    })
    : null;

// =====================================================
// EJS CONFIGURATION
// =====================================================

app.engine("ejs", ejsMate);

app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.urlencoded({
    extended: true
}));

app.use(express.json({
    limit: "1mb"
}));

app.use(methodOverride("_method"));

app.use(express.static(
    path.join(__dirname, "public")
));

app.use(
    "/images",
    express.static(path.join(__dirname, "images"))
);

app.use((req, res, next) => {
    res.locals.currentUser = "Beyond";
    res.locals.wardID = null;
    next();
});

// =====================================================
// FASTAPI REQUEST HELPER
// =====================================================

/**
 * Requests data from FastAPI.
 *
 * - Supports GET and POST.
 * - Passes through the FastAPI HTTP status code.
 * - Returns JSON responses to Express clients.
 * - Reports connection failures without crashing Express.
 */
async function fetchFastAPI(endpoint, options = {}) {
    const method = options.method || "GET";

    const headers = {
        Accept: "application/json"
    };

    const fetchOptions = {
        method,
        headers,
        signal: AbortSignal.timeout(30000)
    };

    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${FASTAPI_URL}${endpoint}`, fetchOptions);

    const responseText = await response.text();

    let data = {};

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            data = {
                detail: responseText
            };
        }
    }

    return {
        status: response.status,
        ok: response.ok,
        data
    };
}

/**
 * Proxies a FastAPI request through Express.
 */
async function proxyFastAPI(req, res, endpoint, method = "GET") {
    try {
        const result = await fetchFastAPI(endpoint, {
            method,
            body: ["GET", "HEAD"].includes(method)
                ? undefined
                : req.body
        });

        return res.status(result.status).json(result.data);
    } catch (error) {
        console.error(
            `FastAPI error [${method} ${endpoint}]:`,
            error.message
        );

        const timedOut =
            error.name === "TimeoutError" ||
            error.name === "AbortError";

        return res.status(timedOut ? 504 : 502).json({
            success: false,
            message: timedOut
                ? "The FastAPI request timed out."
                : "Could not connect to the FastAPI backend.",
            error: error.message
        });
    }
}

// =====================================================
// HOME PAGE
// =====================================================

app.get("/", (req, res) => {
    res.render("BeyondSentinel/risk", {
        userName: "Beyond"
    });
});

// =====================================================
// GEMINI FEEDBACK
// =====================================================

app.post("/api/generate-feedback", async (req, res) => {
    try {
        const { userPrompt } = req.body;

        if (
            typeof userPrompt !== "string" ||
            !userPrompt.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "userPrompt is required."
            });
        }

        if (!ai) {
            return res.status(503).json({
                success: false,
                message: "GEMINI_API_KEY is not configured."
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: userPrompt
        });

        return res.json({
            success: true,
            feedback: response.text
        });
    } catch (error) {
        console.error("Feedback generation error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to generate feedback via Gemini API."
        });
    }
});

// =====================================================
// EXISTING PREDICTION POST ROUTES
// =====================================================

// POST /api/predict
app.post("/api/predict", async (req, res) => {
    console.log("Prediction request received:", req.body);

    return proxyFastAPI(
        req,
        res,
        "/predict",
        "POST"
    );
});

// POST /api/predict/wards
app.post("/api/predict/wards", async (req, res) => {
    console.log("Ward prediction request received:", req.body);

    return proxyFastAPI(
        req,
        res,
        "/predict/wards",
        "POST"
    );
});

// =====================================================
// ML PREDICTIONS — NEW RESPONSE STRUCTURE
// =====================================================

/**
 * FastAPI:
 * GET /ml-predictions
 *
 * Expected response:
 * {
 *   "count": 24,
 *   "heat_risk": [...]
 * }
 *
 * Express:
 * GET /api/ml-predictions
 *
 * Preserves the FastAPI response structure.
 */
app.get("/api/ml-predictions", async (req, res) => {
    try {
        const result = await fetchFastAPI("/ml-predictions");
        if (!result.ok) return res.status(result.status).json({ success: false, error: result.data });
        const data = result.data;
        const predictions = data?.predictions ?? data?.heat_risk;
        if (!Array.isArray(predictions)) return res.status(502).json({ success: false, message: "Invalid ML predictions response", receivedKeys: Object.keys(data ?? {}) });
        return res.json({ success: true, count: data.count ?? predictions.length, forecast_type: data.forecast_type ?? null, predictions: predictions.map(p => ({ ...p, HMRI: p.HMRI ?? p.predicted_hmri })) });
    } catch (error) {
        console.error("ML predictions error:", error.message);
        return res.status(error.name === "TimeoutError" ? 504 : 502).json({ success: false, message: error.message });
    }
});

app.use(express.json());

app.post("/api/budget-plan", async (req, res) => {
    try {
        const budgetLakhs = Number(req.body.budget_lakh);

        if (!Number.isFinite(budgetLakhs) || budgetLakhs <= 0) {
            return res.status(400).json({
                error: "budget_lakh must be a positive number."
            });
        }

        const response = await fetch(
            "http://127.0.0.1:8000/budget-plan",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    budget_inr: Math.round(budgetLakhs * 100000)
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.json(data);

    } catch (error) {
        console.error("Budget plan API error:", error);

        return res.status(502).json({
            error: "Could not connect to the budget planning backend."
        });
    }
});

// =====================================================
// HEAT RISK
// =====================================================

/**
 * FastAPI:
 * GET /heat-risk
 *
 * Passes the actual FastAPI response through to Express.
 * Does not assume the response has the same structure as
 * /ml-predictions.
 */
app.get("/api/heat-risk", async (req, res) => {
    return proxyFastAPI(
        req,
        res,
        "/heat-risk",
        "GET"
    );
});

// =====================================================
// ACTION HISTORY
// =====================================================

/**
 * FastAPI:
 * GET /action-history
 *
 * Returns the response supplied by the Python backend.
 */
app.get("/api/action-history", async (req, res) => {
    return proxyFastAPI(
        req,
        res,
        "/action-history",
        "GET"
    );
});

// =====================================================
// WARDS
// =====================================================

/**
 * Keeps the original Express endpoint.
 *
 * FastAPI:
 * GET /wards
 *
 * Express:
 * GET /api/wards
 */
app.get("/api/wards", async (req, res) => {
    return proxyFastAPI(
        req,
        res,
        "/wards",
        "GET"
    );
});

// =====================================================
// LATEST WEATHER + ML PREDICTION
// =====================================================

app.get("/api/latest-heat-data", async (req, res) => {
    try {
        const weatherURL = new URL(
            "https://api.open-meteo.com/v1/forecast"
        );

        weatherURL.search = new URLSearchParams({
            latitude: "19.0760",
            longitude: "72.8777",
            daily: "temperature_2m_max",
            current: "temperature_2m",
            timezone: "Asia/Kolkata"
        }).toString();

        const weatherResponse = await fetch(weatherURL, {
            signal: AbortSignal.timeout(15000)
        });

        if (!weatherResponse.ok) {
            throw new Error(
                `Weather API returned HTTP ${weatherResponse.status}`
            );
        }

        const weatherData = await weatherResponse.json();

        const peakTemperature = Number(
            weatherData.daily?.temperature_2m_max?.[0]
        );

        const currentTemperature = Number(
            weatherData.current?.temperature_2m
        );

        if (!Number.isFinite(peakTemperature)) {
            throw new Error(
                "Peak temperature was not available."
            );
        }

        // Retain the existing model input format.
        // Replace the assumed values with real weather observations
        // if the model requires those inputs.
        const predictionPayload = {
            temp_mean_c: Number.isFinite(currentTemperature)
                ? currentTemperature
                : peakTemperature,
            temp_max_c: peakTemperature,
            temp_min_c: 30,
            humidity_pct: 60,
            wind_speed_ms: 2,
            solar_radiation_kwh_m2: 5
        };

        const predictionResult = await fetchFastAPI("/predict", {
            method: "POST",
            body: predictionPayload
        });

        if (!predictionResult.ok) {
            throw new Error(
                `FastAPI prediction failed with HTTP ${predictionResult.status}: ` +
                JSON.stringify(predictionResult.data)
            );
        }

        const prediction = predictionResult.data["3d"];

        if (!prediction) {
            throw new Error(
                'Prediction response does not contain a "3d" result.'
            );
        }

        return res.json({
            success: true,
            heatStress: Number(prediction.wbgt_c),
            mortalityRisk: Number(prediction.hmri),
            riskLevel: prediction.risk_level,
            temperature: peakTemperature,
            forecast: predictionResult.data
        });
    } catch (error) {
        console.error("Latest heat data error:", error.message);

        return res.status(502).json({
            success: false,
            message: "Unable to retrieve the latest heat prediction.",
            error: error.message
        });
    }
});

// =====================================================
// BACKEND STATUS
// =====================================================

app.get("/api/backend-status", async (req, res) => {
    try {
        const result = await fetchFastAPI("/");

        return res.status(result.ok ? 200 : 502).json({
            success: result.ok,
            fastapiStatus: result.status,
            fastapiResponse: result.data
        });
    } catch (error) {
        return res.status(502).json({
            success: false,
            message: "FastAPI backend is unreachable.",
            error: error.message
        });
    }
});

// =====================================================
// API 404 HANDLER
// =====================================================

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: `API route not found: ${req.method} ${req.path}`
        });
    }

    return res.status(404).send("Page not found.");
});

// =====================================================
// START EXPRESS SERVER
// =====================================================

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Express server running on port ${PORT}`);
        console.log(`FastAPI backend: ${FASTAPI_URL}`);
    });
}

module.exports = app;