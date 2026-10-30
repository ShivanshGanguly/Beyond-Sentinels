
document.addEventListener("DOMContentLoaded",()=>{
    async function loadHeatRiskData(){
        try{
            const response=await fetch("/api/latest-heat-data",{headers:{"Accept":"application/json"},cache:"no-store"});
            if(!response.ok) throw new Error(`/api/latest-heat-data returned ${response.status}`);
            const data=await response.json();
            const ambientTemp=document.getElementById("ambientTemp");
            const wbgtElement=document.getElementById("wbgtValue");
            if(ambientTemp){
                const temperature=Number(data.temperature);
                ambientTemp.textContent=Number.isFinite(temperature)?`${temperature.toFixed(1)}°C`:"Unavailable";
            }
            if(wbgtElement){
                const wbgt=Number(data.heatStress);
                wbgtElement.textContent=Number.isFinite(wbgt)?`${wbgt.toFixed(1)}°C`:"Unavailable";
            }
        }catch(error){
            console.error("Failed to load WBGT/temperature:",error);
            const ambientTemp=document.getElementById("ambientTemp");
            const wbgtElement=document.getElementById("wbgtValue");
            if(ambientTemp) ambientTemp.textContent="Unavailable";
            if(wbgtElement) wbgtElement.textContent="Unavailable";
        }
    }

    loadHeatRiskData();

    const mapElement=document.getElementById("mumbaiHeatmap");
    if(!mapElement) return;
    if(typeof L==="undefined"){
        console.error("Leaflet is not loaded.");
        return;
    }

    const map=L.map("mumbaiHeatmap",{zoomControl:true}).setView([19.0760,72.8777],10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,
        attribution:"&copy; OpenStreetMap contributors"
    }).addTo(map);

    const weatherData={
        temp_mean_c:35,
        temp_max_c:40,
        temp_min_c:30,
        humidity_pct:60,
        wind_speed_ms:2,
        solar_radiation_kwh_m2:5
    };

    const geoJSON_URL="https://raw.githubusercontent.com/urbanmorph/notf/main/website/public/assets/data/boundaries/mumbai-wards.geojson";

    const wardAliases={
        "F/S":"F_South",
        "F/N":"F_North",
        "G/S":"G_South",
        "G/N":"G_North",
        "H/W":"H_West",
        "H/E":"H_East",
        "K/W":"K_West",
        "K/E":"K_East",
        "M/W":"M_West",
        "M/E":"M_East",
        "P/S":"P_South",
        "P/N":"P_North",
        "R/S":"R_South",
        "R/C":"R_Central",
        "R/N":"R_North"
    };

    function normalizeName(name){
        return String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    }

    function getRiskValue(prediction){
        if(!prediction) return null;
        const value=Number(prediction.hmri??prediction.mortalityRisk??prediction.mortality_risk??prediction.risk);
        return Number.isFinite(value)?value:null;
    }

    function getWBGT(prediction){
        if(!prediction) return null;
        const value=Number(prediction.wbgt_c??prediction.wbgt);
        return Number.isFinite(value)?value:null;
    }

    function getRiskLevel(prediction,risk){
        const level=prediction?.risk_level??prediction?.riskLevel;
        if(level) return String(level);
        if(risk===null) return "Unknown";
        if(risk<25) return "Low";
        if(risk<50) return "Medium";
        if(risk<75) return "Moderate";
        return "Extreme";
    }

    function getRiskColor(risk){
        if(risk===null) return "#808080";
        if(risk<25) return "#0de74f";
        if(risk<50) return "#ffd54f";
        if(risk<75) return "#f57c00";
        return "#d7191c";
    }

    function getPredictionData(prediction){
        let data=prediction?.prediction??prediction;
        if(data?.["3d"]&&typeof data["3d"]==="object") data=data["3d"];
        return data;
    }

    function normalizePredictions(data){
        if(Array.isArray(data)) return data;
        if(Array.isArray(data?.wards)) return data.wards;
        if(Array.isArray(data?.predictions)) return data.predictions;
        if(data&&typeof data==="object"){
            const result=Object.entries(data)
                .filter(([,value])=>value&&typeof value==="object"&&!Array.isArray(value))
                .map(([key,value])=>({ward_id:Number(key),...value}));
            if(result.length) return result;
        }
        throw new Error("Unexpected ward prediction response format.");
    }

    function getFeatureWardName(feature){
        const properties=feature.properties||{};
        const name=String(properties.NAME||properties.name||properties.ward_name||"").trim();
        return wardAliases[name]||name;
    }

    function createWardLookup(wards){
        const lookup=new Map();
        wards.forEach(ward=>lookup.set(normalizeName(ward.ward_name),ward));
        return lookup;
    }

    function createPredictionLookup(predictions){
        const lookup=new Map();
        predictions.forEach(prediction=>{
            const id=Number(prediction.ward_id??prediction.wardID??prediction.id);
            if(Number.isFinite(id)) lookup.set(id,prediction);
        });
        return lookup;
    }

    function createHeatmap(geojson,wards,predictions){
        const wardLookup=createWardLookup(wards);
        const predictionLookup=createPredictionLookup(predictions);
        let matched=0;

        const layer=L.geoJSON(geojson,{
            style:feature=>{
                const name=getFeatureWardName(feature);
                const ward=wardLookup.get(normalizeName(name));
                if(!ward) return {color:"#ffffff",weight:1,fillColor:"#808080",fillOpacity:0.35};

                const prediction=predictionLookup.get(Number(ward.ward_id));
                const data=getPredictionData(prediction);
                return {
                    color:"#ffffff",
                    weight:1.2,
                    fillColor:getRiskColor(getRiskValue(data)),
                    fillOpacity:0.5
                };
            },
            onEachFeature:(feature,featureLayer)=>{
                const name=getFeatureWardName(feature);
                const ward=wardLookup.get(normalizeName(name));
                if(!ward){
                    featureLayer.bindTooltip(`<strong>Ward ${name}</strong><br>Data unavailable`,{sticky:true});
                    return;
                }

                const prediction=predictionLookup.get(Number(ward.ward_id));
                const data=getPredictionData(prediction);
                const risk=getRiskValue(data);
                const wbgt=getWBGT(data);
                const riskLevel=getRiskLevel(data,risk);

                if(prediction&&risk!==null) matched++;

                featureLayer.bindTooltip(`
                    <div style="min-width:130px;line-height:1.7">
                        <strong>Ward:</strong> ${name}<br>
                        <strong>WBGT:</strong> ${wbgt!==null?wbgt.toFixed(2)+" °C":"N/A"}<br>
                        <strong>HMRI:</strong> ${risk!==null?risk.toFixed(2):"N/A"}<br>
                        <strong>Risk Level:</strong> ${riskLevel}
                    </div>
                `,{sticky:true,direction:"top",opacity:0.95});
            }
        }).addTo(map);

        if(layer.getBounds().isValid()) map.fitBounds(layer.getBounds(),{padding:[25,25]});

        console.log(`Ward polygons loaded: ${geojson.features.length}`);
        console.log(`Ward prediction matches: ${matched}`);

        return layer;
    }

    async function initializeDashboard(){
        try{
            console.log("Loading TaapSurakshak ward heatmap...");

            const [wardResponse,predictionResponse,geoResponse]=await Promise.all([
                fetch("/api/wards"),
                fetch("/api/predict/wards",{
                    method:"POST",
                    headers:{"Content-Type":"application/json"},
                    body:JSON.stringify(weatherData)
                }),
                fetch(geoJSON_URL)
            ]);

            if(!wardResponse.ok) throw new Error(`/api/wards returned ${wardResponse.status}`);
            if(!predictionResponse.ok) throw new Error(`/api/predict/wards returned ${predictionResponse.status}`);
            if(!geoResponse.ok) throw new Error(`Ward GeoJSON returned ${geoResponse.status}`);

            const wards=await wardResponse.json();
            const predictionData=await predictionResponse.json();
            const geojson=await geoResponse.json();

            if(!Array.isArray(wards)) throw new Error("Ward API did not return an array.");
            if(!Array.isArray(geojson.features)) throw new Error("Invalid ward GeoJSON.");

            const predictions=normalizePredictions(predictionData);
            createHeatmap(geojson,wards,predictions);

            setTimeout(()=>map.invalidateSize(),300);
            console.log("TaapSurakshak ward heatmap loaded.");
        }catch(error){
            console.error("Dashboard initialization failed:",error);
        }
    }

    window.addEventListener("resize",()=>map.invalidateSize());
    initializeDashboard();
});
