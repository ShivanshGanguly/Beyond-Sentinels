document.addEventListener("DOMContentLoaded", () => {
    const FIXED_BUDGET = 50;
    const geoJSON_URL = "https://raw.githubusercontent.com/urbanmorph/notf/main/website/public/assets/data/boundaries/mumbai-wards.geojson";
    const wardAliases = { "F/S": "F_South", "F/N": "F_North", "G/S": "G_South", "G/N": "G_North", "H/W": "H_West", "H/E": "H_East", "K/W": "K_West", "K/E": "K_East", "M/W": "M_West", "M/E": "M_East", "P/S": "P_South", "P/N": "P_North", "R/S": "R_South", "R/C": "R_Central", "R/N": "R_North" };
    const interventionMenu = [{ id: "trees", name: "Tree Planting", cost: 5, reduction: 0.06 }, { id: "cool_roofs", name: "Cool Roofs", cost: 8, reduction: 0.12 }, { id: "shade_shelters", name: "Shade Shelters", cost: 6, reduction: 0.10 }, { id: "water_kiosks", name: "Water Kiosks", cost: 3, reduction: 0.04 }];

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
            "predicted_hmri",
            "hmri",
            "HMRI",
            "mortalityRisk",
            "mortality_risk",
            "risk"
        ]);
    }

    function getWBGT(data) {
        return getNumericValue(data, [
            "predicted_wbgt",
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
        if (Array.isArray(data?.predictions)) return data.predictions;
        if (Array.isArray(data?.heat_risk)) return data.heat_risk;
        if (Array.isArray(data?.wards)) return data.wards;

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
            const id = Number(prediction.ward_id ?? prediction.wardID ?? prediction.id);

            if (Number.isFinite(id)) lookup.set(id, prediction);
        });

        return lookup;
    }

    function createWardLookup(wards) {
        const lookup = new Map();

        wards.forEach(ward => {
            const name = ward.ward_name ?? ward.name ?? ward.ward ?? "";

            if (name) lookup.set(normalizeName(name), ward);
        });

        return lookup;
    }
    function rankWardsByHMRI(wards, predictions) {
        const wardLookup = new Map(
            wards.map(ward => [
                Number(ward.ward_id ?? ward.id),
                ward
            ])
        );

        return predictions.map(prediction => {
            const wardId = Number(
                prediction.ward_id ?? prediction.wardID ?? prediction.id
            );

            const ward = wardLookup.get(wardId) || {};
            const hmri = getRiskValue(prediction);
            const before = hmri;

            const after = getNumericValue(prediction, [
                "estimated_hmri_after_actions"
            ]);

            // Intervention comes from the API's "actions" field
            const actions = prediction.actions;
            let actionText = "No recommended action";

            if (Array.isArray(actions)) {
                actionText = actions.length
                    ? actions.join(", ")
                    : actionText;
            } else if (actions && typeof actions === "object") {
                actionText = Object.values(actions).join(", ") || actionText;
            } else if (
                actions !== null &&
                actions !== undefined &&
                actions !== ""
            ) {
                actionText = String(actions);
            }

            return {
                ...prediction,
                ward_id: wardId,
                ward_name:
                    prediction.ward_name ??
                    ward.ward_name ??
                    ward.name ??
                    `Ward ${wardId}`,

                hmri,
                wbgt: getWBGT(prediction),

                vulnerabilityScore: normalizeVulnerability(
                    getVulnerabilityScore(prediction) ??
                    getVulnerabilityScore(ward)
                ),

                riskLevel: getRiskLevel(prediction, hmri),
                priorityScore: getNumericValue(prediction, [
                    "priority_score"
                ]),

                before,
                after,

                // Intervention field
                action: actionText,

                // Estimated Cost field: use allocated_budget
                budgetAllocated: getNumericValue(prediction, [
                    "allocated_budget"
                ]),

                greenCover: getNumericValue(prediction, [
                    "green_cover_score_1_to_5"
                ])
            };
        })
            .filter(ward =>
                ward.hmri !== null &&
                ward.priorityScore !== null
            )
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .map((ward, index) => ({
                ...ward,
                priority: index + 1
            }));
    }


    function displayWardPriorities(wards) {
        const table = document.querySelector("#wardPriorityTable tbody");
        if (!table) return;

        if (!wards.length) {
            table.innerHTML = `<tr><td colspan="4">No ward data available.</td></tr>`;
            return;
        }

        table.innerHTML = wards.map(ward => `
            <tr>
                <td>${ward.priority}</td>
                <td>${ward.ward_name}</td>
                <td>${ward.hmri.toFixed(2)}</td>
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
            properties.ward ||
            ""
        ).trim();

        return wardAliases[name] || name;
    }

    function createHeatmap(geojson, wards, predictions) {
        const wardLookup = createWardLookup(wards);
        const predictionLookup = createPredictionLookup(predictions);

        if (wardLayer) {
            map.removeLayer(wardLayer);
        }

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
                const wbgt = getWBGT(data);

                const vulnerability = normalizeVulnerability(
                    getVulnerabilityScore(data) ??
                    getVulnerabilityScore(prediction) ??
                    getVulnerabilityScore(ward)
                );

                const riskLevel = getRiskLevel(data, risk);

                featureLayer.bindTooltip(
                    `<div style="min-width:150px;line-height:1.7">
                        <strong>Ward:</strong> ${ward.ward_name ?? ward.name}<br>
                        <strong>WBGT:</strong> ${wbgt === null ? "N/A" : wbgt.toFixed(2) + "°C"}<br>
                        <strong>Vulnerability Score:</strong> ${vulnerability === null ? "N/A" : vulnerability.toFixed(2)}<br>
                        <strong>HMRI:</strong> ${risk === null ? "N/A" : risk.toFixed(2)}<br>
                        <strong>Risk Level:</strong> ${riskLevel}
                    </div>`,
                    {
                        sticky: true,
                        direction: "top",
                        opacity: 0.95
                    }
                );

                featureLayer.on({
                    mouseover: event => event.target.setStyle({
                        weight: 3,
                        color: "#222222",
                        fillOpacity: 0.9
                    }),
                    mouseout: event => wardLayer.resetStyle(event.target)
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

    function generateBudgetPlan() {
        const selected = rankedWards
            .filter(ward =>
                ward.action &&
                ward.action !== "No recommended action"
            )
            .map(ward => ({
                wardId: ward.ward_id,
                wardName: ward.ward_name,
                priority: ward.priority,
                intervention: ward.action,
                cost: ward.budgetAllocated === null
                    ? null
                    : ward.budgetAllocated / 100000,
                reduction: ward.before === null || ward.after === null
                    ? null
                    : ward.before - ward.after
            }));

        const spent = rankedWards.reduce(
            (sum, ward) => sum + (ward.budgetAllocated ?? 0),
            0
        ) / 100000;

        const remaining = Math.max(0, FIXED_BUDGET - spent);

        const valid = rankedWards.filter(
            ward => ward.before !== null && ward.after !== null
        );

        const averageBefore = valid.length
            ? valid.reduce((sum, ward) => sum + ward.before, 0) / valid.length
            : 0;

        const averageAfter = valid.length
            ? valid.reduce((sum, ward) => sum + ward.after, 0) / valid.length
            : 0;

        const reduction = averageBefore - averageAfter;
        const covered = new Set(selected.map(item => item.wardId)).size;

        const summary = document.getElementById("budgetSummary");

        if (summary) {
            summary.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-3">
                        <strong>Available Budget</strong>
                        <h4>₹${FIXED_BUDGET.toFixed(2)} L</h4>
                    </div>
                    <div class="col-md-3">
                        <strong>Allocated Budget</strong>
                        <h4>₹${spent.toFixed(2)} L</h4>
                    </div>
                    <div class="col-md-3">
                        <strong>Remaining Budget</strong>
                        <h4>₹${remaining.toFixed(2)} L</h4>
                    </div>
                    <div class="col-md-3">
                        <strong>Wards With Actions</strong>
                        <h4>${covered}</h4>
                    </div>
                </div>
                <hr>
                <strong>Average HMRI Before:</strong> ${averageBefore.toFixed(2)}<br>
                <strong>Average Estimated HMRI After:</strong> ${averageAfter.toFixed(2)}<br>
                <strong>Estimated Average HMRI Reduction:</strong> ${reduction.toFixed(2)} points<br>
                <small>Post-action values and allocations are model estimates returned by the backend.</small>
            `;
        }

        const plan = document.getElementById("recommendedPlan");

        if (plan) {
            plan.innerHTML = selected.length
                ? selected.map(item => `
                    <tr>
                        <td>${item.wardName} (Priority ${item.priority})</td>
                        <td>${item.intervention}</td>
                        <td>${item.cost === null ? "N/A" : `₹${item.cost.toFixed(2)} lakh`}</td>
                        <td>${item.reduction === null ? "N/A" : `${item.reduction.toFixed(2)} points`}</td>
                    </tr>
                `).join("")
                : `<tr><td colspan="4">No recommended actions returned by the API.</td></tr>`;
        }

        const beforeAfter = document.getElementById("beforeAfterTable");

        if (beforeAfter) {
            beforeAfter.innerHTML = rankedWards.map(ward => `
                <tr>
                    <td>${ward.ward_name}</td>
                    <td>${ward.priority}</td>
                    <td>${ward.before === null ? "N/A" : ward.before.toFixed(2)}</td>
                    <td>${ward.after === null ? "N/A" : ward.after.toFixed(2)}</td>
                    <td>${ward.before === null || ward.after === null ? "N/A" : `${(ward.before - ward.after).toFixed(2)} points`}</td>
                </tr>
            `).join("");
        }
    }

    function updateWardMetrics() {
        const wardSelect = document.getElementById("wardSelect");
        const wardId = Number(wardSelect?.value);

        const selectedWard = wardPredictions.find(
            ward => Number(ward.ward_id ?? ward.wardID ?? ward.id) === wardId
        );

        if (!selectedWard) {
            showMetricError();
            return;
        }

        const prediction = getPredictionData(selectedWard);
        const wbgt = getWBGT(prediction);
        const hmri = getRiskValue(prediction);

        const wbgtElement = document.getElementById("wbgtValue");
        const hmriElement = document.getElementById("hmriValue");
        const riskElement = document.getElementById("riskLevel");
        const ambient = document.getElementById("ambientTemp");

        if (wbgtElement) {
            wbgtElement.textContent = wbgt === null
                ? "Unavailable"
                : `${wbgt.toFixed(2)}°C`;
        }

        if (hmriElement) {
            hmriElement.textContent = hmri === null
                ? "Unavailable"
                : hmri.toFixed(2);
        }

        if (riskElement) {
            riskElement.textContent = getRiskLevel(prediction, hmri);
        }

        const temperature = getNumericValue(prediction, [
            "temp_mean_c",
            "temperature",
            "temperature_2m"
        ]);

        if (ambient) {
            ambient.textContent = temperature === null
                ? "Unavailable"
                : `${temperature.toFixed(1)}°C`;
        }
    }

    function showMetricError() {
        const wbgt = document.getElementById("wbgtValue");
        const hmri = document.getElementById("hmriValue");
        const risk = document.getElementById("riskLevel");

        if (wbgt) wbgt.textContent = "Unavailable";
        if (hmri) hmri.textContent = "Unavailable";
        if (risk) risk.textContent = "Unavailable";
    }

    function populateWardSelect(predictions) {
        const wardSelect = document.getElementById("wardSelect");

        if (!wardSelect) return;

        wardSelect.innerHTML = "";
        wardPredictions = predictions;

        predictions.forEach(ward => {
            const option = document.createElement("option");

            option.value = ward.ward_id ?? ward.wardID ?? ward.id;
            option.textContent = ward.ward_name ?? ward.name ?? `Ward ${option.value}`;

            wardSelect.appendChild(option);
        });

        if (!predictions.length) {
            wardSelect.innerHTML = `<option value="">No wards available</option>`;
            showMetricError();
            return;
        }

        wardSelect.removeEventListener("change", updateWardMetrics);
        wardSelect.addEventListener("change", updateWardMetrics);

        updateWardMetrics();
    }

    async function initializeDashboard() {
        try {
            const [predictionResponse, geoResponse] = await Promise.all([
                fetch("/api/ml-predictions", {
                    headers: { "Accept": "application/json" },
                    cache: "no-store"
                }),
                fetch(geoJSON_URL)
            ]);

            if (!predictionResponse.ok) {
                const errorData = await predictionResponse.json().catch(() => ({}));

                throw new Error(
                    `ML predictions returned ${predictionResponse.status}: ${errorData.message || errorData.error || "Unknown error"}`
                );
            }

            if (!geoResponse.ok) {
                throw new Error(`Ward GeoJSON returned ${geoResponse.status}`);
            }

            const predictionData = await predictionResponse.json();
            const geojson = await geoResponse.json();

            const predictions = normalizePredictions(predictionData)
                .filter(prediction =>
                    Number.isFinite(Number(
                        prediction.ward_id ?? prediction.wardID ?? prediction.id
                    ))
                );

            if (!predictions.length) {
                throw new Error("The API returned no valid ward predictions.");
            }

            if (!Array.isArray(geojson.features)) {
                throw new Error("Invalid ward GeoJSON.");
            }

            const wards = predictions.map(prediction => ({
                ward_id: prediction.ward_id ?? prediction.wardID ?? prediction.id,
                ward_name: prediction.ward_name ?? prediction.name ?? `Ward ${prediction.ward_id ?? prediction.id}`
            }));

            rankedWards = rankWardsByHMRI(wards, predictions);

            displayWardPriorities(rankedWards);
            createHeatmap(geojson, wards, predictions);
            populateWardSelect(predictions);
            renderInterventionMenu();
            generateBudgetPlan();

            console.table(rankedWards);

            if (rankedWards.length !== 24) {
                console.warn(
                    `Expected 24 ranked wards, but received ${rankedWards.length}.`
                );
            }

            setTimeout(() => map.invalidateSize(), 300);
        } catch (error) {
            console.error("Dashboard initialization failed:", error);

            const table = document.querySelector("#wardPriorityTable tbody");

            if (table) {
                table.innerHTML = `
                    <tr>
                        <td colspan="4">Unable to load ward rankings. Check the browser console.</td>
                    </tr>
                `;
            }

            const summary = document.getElementById("budgetSummary");

            if (summary) {
                summary.textContent = "Unable to generate the budget plan because ward data could not be loaded.";
            }

            const plan = document.getElementById("recommendedPlan");

            if (plan) {
                plan.innerHTML = `<tr><td colspan="4">Ward prediction data is unavailable.</td></tr>`;
            }

            const beforeAfter = document.getElementById("beforeAfterTable");

            if (beforeAfter) {
                beforeAfter.innerHTML = `<tr><td colspan="5">Ward prediction data is unavailable.</td></tr>`;
            }

            showMetricError();
        }
    }

    initializeDashboard();

    window.addEventListener("resize", () => map.invalidateSize());
});