const API_KEY = process.env.RETAIL_RECON_KEY || "";

const MARKET_LOGIC = {
    categories: {
        standard: { ebayFee: 0.1325, poshFee: 0.20, vol: 0.05 },
        electronics: { ebayFee: 0.08, poshFee: 0.20, vol: 0.15 },
        collectibles: { ebayFee: 0.12, poshFee: 0.20, vol: 0.10 },
        sneakers: { ebayFee: 0.00, poshFee: 0.20, vol: 0.08 },
        media: { ebayFee: 0.1495, poshFee: 0.20, vol: 0.03 }
    }
};

const requestLog = {};

function rateLimit(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 15;
    if (!requestLog[ip]) requestLog[ip] = [];
    requestLog[ip] = requestLog[ip].filter(t => now - t < windowMs);
    if (requestLog[ip].length >= maxRequests) return false;
    requestLog[ip].push(now);
    return true;
}

async function generateSEO({ title, description, platform = "general" }) {
    if (!title || !description) {
        return { error: "Title and description required" };
    }

    try {
    const parsed = {
    seoTitle: `${title} - Optimized`,
    seoDescription: `${description} - Optimized for ${platform}`,
    seoKeywords: title.split(" ").slice(0, 10).join(","),
    styleTags: title.split(" ").slice(0, 5)
};

        // Debug logging (optional, helps see why it fails)
        console.log("SEO API status:", apiResponse.status, apiResponse.statusText);
        const rawText = await apiResponse.text();
        console.log("SEO API raw response:", rawText);

        if (!apiResponse.ok) {
            throw new Error(`Backend API failed with status ${apiResponse.status}`);
        }

        const parsed = JSON.parse(rawText); // parse the actual JSON returned by your API

        return {
            seoTitle: parsed.seoTitle || title,
            seoDescription: parsed.seoDescription || description,
            seoKeywords: parsed.seoKeywords || "",
            styleTags: parsed.styleTags || []
        };

    } catch (err) {
        console.error("AI SEO Error:", err);

        return {
            seoTitle: title,
            seoDescription: description,
            seoKeywords: "",
            styleTags: []
        };
    }
}

// ✅ Netlify requires exports.handler
exports.handler = async function(event, context) {

    const jsonResponse = (status, data) => ({
        statusCode: status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // allow frontend calls
            "Access-Control-Allow-Headers": "Content-Type, x-api-key",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        body: JSON.stringify(data)
    });

    // Handle preflight requests
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, { message: "CORS OK" });
    }

    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    try {
        const reqBody = JSON.parse(event.body || "{}");
        const ip = event.headers["x-forwarded-for"] || "unknown";

        if (!rateLimit(ip)) return jsonResponse(429, { error: "Rate limit exceeded. Please wait." });

        const { action } = reqBody;

        // SEO mode
if (action === "seo") {
    const seoResult = await generateSEO({
        title: reqBody.title || "",
        description: reqBody.description || "",
        platform: reqBody.platform || "general"
    });
    return jsonResponse(200, seoResult);
}

        // Retail Recon mode
        const { price, cost, weight, category, taxMode, marketSort, isReverseMode } = reqBody;

        if ([price, cost, weight].some(v => typeof v !== "number" || v < 0))
            return jsonResponse(400, { error: "Invalid numeric inputs" });

        if (price > 100000 || cost > 100000 || weight > 200)
            return jsonResponse(400, { error: "Input exceeds allowed range" });

        const activeFees = MARKET_LOGIC.categories[category] || MARKET_LOGIC.categories.standard;

        const platforms = [
            { name: "Poshmark", risk: "Low", baseRisk: 1, riskClass: "risk-low", feeFn: p => p < 15 ? 2.95 : p * activeFees.poshFee, shipFn: w => w > 5 ? (w - 5) * 4.5 : 0, days: 5, logic: "Buyer Pays Shipping", complexity: "Low" },
            { name: "eBay", risk: "Med", baseRisk: 2, riskClass: "risk-med", feeFn: p => (p * activeFees.ebayFee) + 0.3, shipFn: w => w <= 1 ? 5.5 : 8.5, days: 3, logic: "Max Reach Search", complexity: "High" },
            { name: "StockX", risk: "Low", baseRisk: 1, riskClass: "risk-low", feeFn: p => p * 0.12, shipFn: w => 0, days: 14, logic: "Authentication", complexity: "Med" },
            { name: "OfferUp", risk: "High", baseRisk: 4, riskClass: "risk-high", feeFn: p => 0, shipFn: w => 0, days: 1, logic: "Local Cash", complexity: "High" },
            { name: "Depop", risk: "Med", baseRisk: 2, riskClass: "risk-med", feeFn: p => (p * 0.133) + 0.45, shipFn: w => 5.49, days: 4, logic: "Gen Z Aesthetic", complexity: "Low" },
            { name: "Etsy", risk: "Low", baseRisk: 1, riskClass: "risk-low", feeFn: p => (p * 0.065) + 0.2, shipFn: w => 6.0, days: 7, logic: "Vintage/Handmade", complexity: "High" },
            { name: "Mercari", risk: "Med", baseRisk: 2, riskClass: "risk-med", feeFn: p => (p * 0.1) + 0.5, shipFn: w => 7.4, days: 4, logic: "Direct/Fast", complexity: "Low" },
            { name: "Pinterest", risk: "Low", baseRisk: 1, riskClass: "risk-low", feeFn: p => 0, shipFn: w => 0, days: 30, logic: "Affiliate/Direct", complexity: "High" }
        ];

        let taxRate = 0;
        if (taxMode === "sole") taxRate = 0.153;
        if (taxMode === "llc") taxRate = 0.12;

        const results = platforms.map(plat => {
            let p = price;
            let net;

            if (isReverseMode) {
                const target = price;
                p = (target + cost + plat.shipFn(weight)) / 0.8;
                for (let i = 0; i < 10; i++) {
                    net = p - plat.feeFn(p) - plat.shipFn(weight) - cost;
                    p = p + (target - net);
                }
            } else {
                net = p - plat.feeFn(p) - plat.shipFn(weight) - cost;
            }

            const postTaxNet = net - net * taxRate;
            const roi = cost > 0 ? (postTaxNet / cost) * 100 : 0;
            const yieldPerDay = postTaxNet / plat.days;
            const adjRisk = plat.baseRisk + activeFees.vol * 10;

            return {
                name: plat.name,
                risk: plat.risk,
                riskClass: plat.riskClass,
                logic: plat.logic,
                complexity: plat.complexity,
                days: plat.days,
                calcPrice: p,
                net,
                postTax: postTaxNet,
                roi,
                yieldPerDay,
                adjRisk
            };
        });

        results.sort((a, b) => {
            if (marketSort === "roi") return b.roi - a.roi;
            if (marketSort === "speed") return b.yieldPerDay - a.yieldPerDay;
            if (marketSort === "risk") return a.adjRisk - b.adjRisk;
            return b.postTax - a.postTax;
        });

        return jsonResponse(200, { results, topResult: results[0] });

    } catch (err) {
        console.error("Retail Recon Error:", err);
        return jsonResponse(500, { error: "Internal server error" });
    }
};
