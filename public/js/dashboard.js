document.addEventListener("DOMContentLoaded", () => {
    const FIXED_BUDGET = 50;

    const weatherData = {
        temp_mean_c: 35,
        temp_max_c: 40,
        temp_min_c: 30,
        humidity_pct: 60,
        wind_speed_ms: 2,
        solar_radiation_kwh_m2: 5
    };

    const geoJSON_URL = "https://raw.githubusercontent.com/urbanmorph/notf/main/website/public/assets/data/boundaries/mumbai-wards.geojson";

    const wardAliases = {
        "F/S": "F_South",
        "F/N": "F_North",
        "G/S": "G_South",
        "G/N": "G_North",
        "H/W": "H_West",
        "H/E": "H_East",
        "K/W": "K_West",
        "K/E": "K_East",
        "M/W": "M_West",
        "M/E": "M_East",
        "P/S": "P_South",
        "P/N": "P_North",
        "R/S": "R_South",
        "R/C": "R_Central",
        "R/N": "R_North"
    };

    const interventionMenu = [
        { id: "trees", name: "Tree Planting", cost: 5, reduction: 0.06 },
        { id: "cool_roofs", name: "Cool Roofs", cost: 8, reduction: 0.12 },
        { id: "shade_shelters", name: "Shade Shelters", cost: 6, reduction: 0.10 },
        { id: "water_kiosks", name: "Water Kiosks", cost: 3, reduction: 0.04 }
    ];

    let rankedWards = [];
    let wardLayer = null;
    let wardPredictions = [];

    const mapElement = document.getElementById("mumbaiHeatmap");

    if (!mapElement || typeof L === "undefined") {
        console.error("Map element or Leaflet is unavailable.");
        return;
    }

    const map = L.map("mumbaiHeatmap").setView([19.0760, 72.8777], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    function normalizeName(name) {
        return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function getNumericValue(data, keys) {
        if (!data) return null;

        for (const key of keys) {
            const value = data[key];

            if (value === null || value === undefined || value === "") continue;

            const number = Number(value);

            if (Number.isFinite(number)) return number;
        }

        return null;
    }

    function getRiskValue(data) {
        return getNumericValue(data, [
            "hmri",
            "HMRI",
            "mortalityRisk",
            "mortality_risk",
            "risk"
        ]);
    }

    function getWBGT(data) {
        return getNumericValue(data, [
            "wbgt_c",
            "wbgt",
            "WBGT"
        ]);
    }

    function getVulnerabilityScore(data) {
        return getNumericValue(data, [
            "vulnerability_score",
            "vulnerabilityScore",
            "vulnerability",
            "vulnerability_index"
        ]);
    }

    function normalizeVulnerability(value) {
        if (value === null || value === undefined || value === "") return null;

        const number = Number(value);

        if (!Number.isFinite(number)) return null;

        return number <= 1 ? number * 100 : number;
    }

    function getRiskLevel(data, risk) {
        const level = data?.risk_level ?? data?.riskLevel;

        if (level) return String(level);
        if (risk === null) return "Unknown";
        if (risk < 25) return "Low";
        if (risk < 50) return "Medium";
        if (risk < 75) return "Moderate";

        return "Extreme";
    }

    function getRiskColor(risk) {
        if (risk === null) return "#808080";
        if (risk < 25) return "#0de74f";
        if (risk < 50) return "#ffd54f";
        if (risk < 75) return "#f57c00";

        return "#d7191c";
    }

    function getPredictionData(prediction) {
        let data = prediction?.prediction ?? prediction;

        if (data?.["3d"]) data = data["3d"];
        else if (data?.["4d"]) data = data["4d"];
        else if (data?.["5d"]) data = data["5d"];

        return data;
    }

    function normalizePredictions(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.wards)) return data.wards;
        if (Array.isArray(data?.predictions)) return data.predictions;

        if (data && typeof data === "object") {
            return Object.entries(data)
                .filter(([, value]) => value && typeof value === "object")
                .map(([key, value]) => ({
                    ward_id: Number(key),
                    ...value
                }));
        }

        throw new Error("Unexpected prediction response format.");
    }

    function createPredictionLookup(predictions) {
        const lookup = new Map();

        predictions.forEach(prediction => {
            const id = Number(
                prediction.ward_id ??
                prediction.wardID ??
                prediction.id
            );

            if (Number.isFinite(id)) {
                lookup.set(id, prediction);
            }
        });

        return lookup;
    }

    function createWardLookup(wards) {
        const lookup = new Map();

        wards.forEach(ward => {
            const name = ward.ward_name ?? ward.name ?? ward.ward ?? "";

            if (name) {
                lookup.set(normalizeName(name), ward);
            }
        });

        return lookup;
    }

    function rankWardsByHMRI(wards, predictions) {
        const predictionLookup = createPredictionLookup(predictions);

        return wards.map(ward => {
            const wardId = Number(ward.ward_id ?? ward.id);
            const prediction = predictionLookup.get(wardId);
            const data = getPredictionData(prediction);

            const hmri = getRiskValue(data);
            const vulnerability = normalizeVulnerability(
                getVulnerabilityScore(data) ??
                getVulnerabilityScore(prediction) ??
                getVulnerabilityScore(ward)
            );

            return {
                ward_id: wardId,
                ward_name: ward.ward_name ?? ward.name ?? ward.ward ?? `Ward ${wardId}`,
                hmri,
                vulnerabilityScore: vulnerability,
                riskLevel: getRiskLevel(data, hmri)
            };
        })
            .filter(ward => ward.hmri !== null)
            .sort((a, b) => b.hmri - a.hmri)
            .map((ward, index) => ({
                ...ward,
                priority: index + 1
            }));
    }

    function displayWardPriorities(wards) {
        const table = document.querySelector("#wardPriorityTable tbody");

        if (!table) return;

        if (!wards.length) {
            table.innerHTML = `<tr><td colspan="5">No ward data available.</td></tr>`;
            return;
        }

        table.innerHTML = wards.map(ward => `
            <tr>
                <td>${ward.priority}</td>
                <td>${ward.ward_name}</td>
                <td>${ward.hmri.toFixed(2)}</td>
                <td>${ward.vulnerabilityScore === null ? "N/A" : ward.vulnerabilityScore.toFixed(2)}</td>
                <td>${ward.riskLevel}</td>
            </tr>
        `).join("");
    }

    function getFeatureWardName(feature) {
        const properties = feature.properties || {};
        const name = String(
            properties.NAME ||
            properties.name ||
            properties.ward_name ||
            ""
        ).trim();

        return wardAliases[name] || name;
    }

    function createHeatmap(geojson, wards, predictions) {
        const wardLookup = createWardLookup(wards);
        const predictionLookup = createPredictionLookup(predictions);

        wardLayer = L.geoJSON(geojson, {
            style: feature => {
                const name = getFeatureWardName(feature);
                const ward = wardLookup.get(normalizeName(name));

                if (!ward) {
                    return {
                        color: "#ffffff",
                        weight: 1,
                        fillColor: "#808080",
                        fillOpacity: 0.35
                    };
                }

                const prediction = predictionLookup.get(
                    Number(ward.ward_id ?? ward.id)
                );

                const risk = getRiskValue(getPredictionData(prediction));

                return {
                    color: "#ffffff",
                    weight: 1.2,
                    fillColor: getRiskColor(risk),
                    fillOpacity: 0.5
                };
            },

            onEachFeature: (feature, featureLayer) => {
                const name = getFeatureWardName(feature);
                const ward = wardLookup.get(normalizeName(name));

                if (!ward) {
                    featureLayer.bindTooltip(
                        `<strong>Ward ${name}</strong><br>Data unavailable`,
                        { sticky: true }
                    );
                    return;
                }

                const prediction = predictionLookup.get(
                    Number(ward.ward_id ?? ward.id)
                );

                const data = getPredictionData(prediction);
                const risk = getRiskValue(data);

                const vulnerability = normalizeVulnerability(
                    getVulnerabilityScore(data) ??
                    getVulnerabilityScore(prediction) ??
                    getVulnerabilityScore(ward)
                );

                const riskLevel = getRiskLevel(data, risk);

                featureLayer.bindTooltip(`
                    <div style="min-width:150px;line-height:1.7">
                        <strong>Ward:</strong> ${ward.ward_name ?? ward.name}<br>
                        <strong>Vulnerability Score:</strong> ${vulnerability === null ? "N/A" : vulnerability.toFixed(2)}<br>
                        <strong>HMRI:</strong> ${risk === null ? "N/A" : risk.toFixed(2)}<br>
                        <strong>Risk Level:</strong> ${riskLevel}
                    </div>
                `, {
                    sticky: true,
                    direction: "top",
                    opacity: 0.95
                });

                featureLayer.on({
                    mouseover: event => {
                        event.target.setStyle({
                            weight: 3,
                            color: "#222222",
                            fillOpacity: 0.9
                        });
                    },
                    mouseout: event => {
                        wardLayer.resetStyle(event.target);
                    }
                });
            }
        }).addTo(map);

        if (wardLayer.getBounds().isValid()) {
            map.fitBounds(wardLayer.getBounds(), { padding: [25, 25] });
        }
    }

    function renderInterventionMenu() {
        const body = document.getElementById("interventionMenu");

        if (!body) return;

        body.innerHTML = interventionMenu.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>₹${item.cost} lakh</td>
                <td>${(item.reduction * 100).toFixed(0)}%</td>
            </tr>
        `).join("");
    }

    function optimizeInterventions(wards, budget) {
        const candidates = [];

        wards.forEach(ward => {
            const baseline = ward.vulnerabilityScore;

            if (baseline === null || baseline <= 0) return;

            interventionMenu.forEach(intervention => {
                const reduction = baseline * intervention.reduction;
                const priorityWeight = 1 + (Math.max(0, 25 - ward.priority) / 24) * 0.5;

                candidates.push({
                    wardId: ward.ward_id,
                    wardName: ward.ward_name,
                    priority: ward.priority,
                    intervention: intervention.name,
                    cost: intervention.cost,
                    reduction,
                    benefit: reduction * priorityWeight
                });
            });
        });

        const n = candidates.length;
        const dp = Array.from(
            { length: n + 1 },
            () => Array(budget + 1).fill(0)
        );

        for (let i = 1; i <= n; i++) {
            const item = candidates[i - 1];

            for (let b = 0; b <= budget; b++) {
                dp[i][b] = dp[i - 1][b];

                if (item.cost <= b) {
                    dp[i][b] = Math.max(
                        dp[i][b],
                        dp[i - 1][b - item.cost] + item.benefit
                    );
                }
            }
        }

        const selected = [];
        let remaining = budget;

        for (let i = n; i > 0; i--) {
            if (dp[i][remaining] > dp[i - 1][remaining]) {
                const item = candidates[i - 1];
                selected.push(item);
                remaining -= item.cost;
            }
        }

        return selected;
    }

    function renderRecommendedPlan(selected) {
        const body = document.getElementById("recommendedPlan");

        if (!body) return;

        if (!selected.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="4">No interventions could be selected. Check whether vulnerability data is available.</td>
                </tr>
            `;
            return;
        }

        body.innerHTML = selected.map(item => `
            <tr>
                <td>${item.wardName} (Priority ${item.priority})</td>
                <td>${item.intervention}</td>
                <td>₹${item.cost.toFixed(2)} lakh</td>
                <td>${item.reduction.toFixed(2)} points</td>
            </tr>
        `).join("");
    }

    function displayBeforeAfter(wards) {
        const body = document.getElementById("beforeAfterTable");

        if (!body) return;

        body.innerHTML = wards.map(ward => `
            <tr>
                <td>${ward.ward_name}</td>
                <td>${ward.priority}</td>
                <td>${ward.before === null ? "N/A" : ward.before.toFixed(2)}</td>
                <td>${ward.after === null ? "N/A" : ward.after.toFixed(2)}</td>
                <td>${ward.reduction === null ? "N/A" : ward.reduction.toFixed(2) + " points"}</td>
            </tr>
        `).join("");
    }

    function generateBudgetPlan() {
        if (!rankedWards.length) return;

        const selected = optimizeInterventions(rankedWards, FIXED_BUDGET);
        const spent = selected.reduce((sum, item) => sum + item.cost, 0);
        const remaining = FIXED_BUDGET - spent;

        const wardResults = rankedWards.map(ward => {
            const before = ward.vulnerabilityScore;

            const wardInterventions = selected.filter(
                item => item.wardId === ward.ward_id
            );

            const totalReduction = wardInterventions.reduce(
                (sum, item) => sum + item.reduction,
                0
            );

            const after = before === null
                ? null
                : Math.max(0, before - totalReduction);

            return {
                ...ward,
                before,
                after,
                reduction: before === null ? null : before - after
            };
        });

        const validWards = wardResults.filter(
            ward => ward.before !== null
        );

        const beforeTotal = validWards.reduce(
            (sum, ward) => sum + ward.before,
            0
        );

        const afterTotal = validWards.reduce(
            (sum, ward) => sum + ward.after,
            0
        );

        const averageBefore = validWards.length
            ? beforeTotal / validWards.length
            : 0;

        const averageAfter = validWards.length
            ? afterTotal / validWards.length
            : 0;

        const averageReduction = averageBefore - averageAfter;

        const reductionPercent = averageBefore > 0
            ? (averageReduction / averageBefore) * 100
            : 0;

        const coveredWards = new Set(
            selected.map(item => item.wardId)
        ).size;

        const summary = document.getElementById("budgetSummary");

        if (summary) {
            summary.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-3">
                        <strong>Available Budget</strong>
                        <h4>₹${FIXED_BUDGET.toFixed(2)} L</h4>
                    </div>
                    <div class="col-md-3">
                        <strong>Recommended Spending</strong>
                        <h4>₹${spent.toFixed(2)} L</h4>
                    </div>
                    <div class="col-md-3">
                        <strong>Remaining Budget</strong>
                        <h4>₹${remaining.toFixed(2)} L</h4>
                    </div>
                    <div class="col-md-3">
                        <strong>Wards Covered</strong>
                        <h4>${coveredWards}</h4>
                    </div>
                </div>
                <hr>
                <strong>Average Vulnerability Before:</strong> ${averageBefore.toFixed(2)}
                <br>
                <strong>Average Vulnerability After:</strong> ${averageAfter.toFixed(2)}
                <br>
                <strong>Estimated Average Reduction:</strong> ${averageReduction.toFixed(2)} points (${reductionPercent.toFixed(1)}%)
                <br>
                <small>Reductions are illustrative estimates based on the intervention assumptions, not measured outcomes.</small>
            `;
        }

        renderRecommendedPlan(selected);
        displayBeforeAfter(wardResults);
    }

    function updateWardMetrics() {
        const wardSelect = document.getElementById("wardSelect");
        const wardId = Number(wardSelect?.value);

        const selectedWard = wardPredictions.find(
            ward => Number(ward.ward_id ?? ward.id) === wardId
        );

        if (!selectedWard) {
            showMetricError();
            return;
        }

        const prediction = getPredictionData(selectedWard);
        const wbgt = getWBGT(prediction);
        const hmri = getRiskValue(prediction);
        const risk = getRiskLevel(prediction, hmri);

        document.getElementById("wbgtValue").textContent =
            wbgt === null ? "Unavailable" : `${wbgt.toFixed(2)}°C`;

        document.getElementById("hmriValue").textContent =
            hmri === null ? "Unavailable" : hmri.toFixed(2);

        document.getElementById("riskLevel").textContent = risk;
    }

    function showMetricError() {
        document.getElementById("wbgtValue").textContent = "Unavailable";
        document.getElementById("hmriValue").textContent = "Unavailable";
        document.getElementById("riskLevel").textContent = "Unavailable";
    }

    function populateWardSelect(predictions) {
        const wardSelect = document.getElementById("wardSelect");

        if (!wardSelect) return;

        wardSelect.innerHTML = "";

        wardPredictions = predictions;

        predictions.forEach(ward => {
            const option = document.createElement("option");
            option.value = ward.ward_id ?? ward.id;
            option.textContent = ward.ward_name ?? ward.name ?? `Ward ${option.value}`;
            wardSelect.appendChild(option);
        });

        if (!predictions.length) {
            wardSelect.innerHTML = `<option value="">No wards available</option>`;
            showMetricError();
            return;
        }

        wardSelect.addEventListener("change", updateWardMetrics);
        updateWardMetrics();
    }

    async function loadHeatRiskData() {
        try {
            const response = await fetch("/api/latest-heat-data", {
                headers: { "Accept": "application/json" },
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`/api/latest-heat-data returned ${response.status}`);
            }

            const data = await response.json();
            const temperature = getNumericValue(data, ["temperature"]);
            const wbgt = getNumericValue(data, ["heatStress"]);

            document.getElementById("ambientTemp")?.replaceChildren(
                document.createTextNode(
                    temperature === null ? "Unavailable" : `${temperature.toFixed(1)}°C`
                )
            );

            const wbgtElement = document.getElementById("wbgtValue");

            if (wbgtElement && wbgt === null) {
                wbgtElement.textContent = "Unavailable";
            }
        } catch (error) {
            console.error("Failed to load latest heat data:", error);
        }
    }

    async function initializeDashboard() {
        try {
            const [wardResponse, predictionResponse, geoResponse] = await Promise.all([
                fetch("/api/wards", { cache: "no-store" }),
                fetch("/api/predict/wards", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(weatherData)
                }),
                fetch(geoJSON_URL)
            ]);

            if (!wardResponse.ok) {
                throw new Error(`/api/wards returned ${wardResponse.status}`);
            }

            if (!predictionResponse.ok) {
                throw new Error(`/api/predict/wards returned ${predictionResponse.status}`);
            }

            if (!geoResponse.ok) {
                throw new Error(`Ward GeoJSON returned ${geoResponse.status}`);
            }

            const wardsData = await wardResponse.json();
            const predictionData = await predictionResponse.json();
            const geojson = await geoResponse.json();

            const wards = Array.isArray(wardsData)
                ? wardsData
                : wardsData.wards;

            if (!Array.isArray(wards)) {
                throw new Error("Ward API did not return an array.");
            }

            if (!Array.isArray(geojson.features)) {
                throw new Error("Invalid ward GeoJSON.");
            }

            const predictions = normalizePredictions(predictionData);

            rankedWards = rankWardsByHMRI(wards, predictions);

            displayWardPriorities(rankedWards);
            createHeatmap(geojson, wards, predictions);
            populateWardSelect(predictions);
            renderInterventionMenu();
            generateBudgetPlan();

            console.table(rankedWards);

            if (rankedWards.length !== 24) {
                console.warn(
                    `Expected 24 ranked wards, but received ${rankedWards.length}. Check ward matching and HMRI data.`
                );
            }

            setTimeout(() => map.invalidateSize(), 300);
        } catch (error) {
            console.error("Dashboard initialization failed:", error);

            const table = document.querySelector("#wardPriorityTable tbody");

            if (table) {
                table.innerHTML = `
                    <tr>
                        <td colspan="5">Unable to load ward rankings. Check the browser console.</td>
                    </tr>
                `;
            }

            const summary = document.getElementById("budgetSummary");

            if (summary) {
                summary.textContent = "Unable to generate the budget plan because ward data could not be loaded.";
            }
        }
    }

    loadHeatRiskData();
    initializeDashboard();

    window.addEventListener("resize", () => map.invalidateSize());
});