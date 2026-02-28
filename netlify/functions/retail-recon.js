const API_KEY = process.env.RETAIL_RECON_KEY || "";

const MARKET_LOGIC = {
    calculate: (platform, price, weight, category) => {
        let fee = 0;
        let shipping = 0;
        const p = parseFloat(price) || 0;
        const w = parseFloat(weight) || 0;
        const shipCost = w <= 1 ? 6.50 : w <= 5 ? 8.27 : 12.00;

        switch (platform) {
            case 'poshmark':
                fee = p < 15 ? 2.95 : p * 0.20;
                break;
            case 'ebay':
                const rate = MARKET_LOGIC.categories[category]?.ebayFee || 0.136;
                fee = (p * rate) + 0.40;
                shipping = shipCost * 0.136; 
                break;
            case 'mercari':
                fee = (p + shipCost) * 0.10;
                break;
            case 'depop':
                fee = (p * 0.033) + 0.45;
                break;
        }
        const net = p - fee - shipping;
        // The || 0 ensures we never return null
        return { 
            net: net || 0, 
            fee: (fee + shipping) || 0, 
            roi: p > 0 ? ((net / p) * 100) : 0 
        };
    },
    categories: {
        standard: { ebayFee: 0.136 },
        electronics: { ebayFee: 0.08 },
        collectibles: { ebayFee: 0.1325 },
        sneakers: { ebayFee: 0.08 },
        media: { ebayFee: 0.153 }
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
    if (!title) return { aiStatus: "input missing" };

    try {
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.RETAIL_RECON_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `You are an expert resale marketplace SEO optimizer. 
                            Create a high-converting listing title (under 80 chars), a keyword-rich description, and 8 style tags. 
                            Return ONLY JSON: {"title": "...", "description": "...", "tags": ["tag1", "tag2", ...]}
                            Platform: ${platform}
                            Item: ${title}`
                        }]
                    }]
                })
            }
        );

        const data = await geminiResponse.json();

        // Check if Gemini actually returned an answer
        if (!data.candidates || !data.candidates[0].content) {
            throw new Error(data.error?.message || "AI returned empty response");
        }

        const rawText = data.candidates[0].content.parts[0].text;
        const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        return {
            aiTitle: parsed.title,
            aiDescription: parsed.description,
            styleTags: parsed.tags || [],
            aiStatus: "online"
        };

    } catch (error) {
        console.error("DEBUG - AI Failure:", error.message);
        // This is where the "repetition" happens. 
        // We add "AI Error" so you can SEE that it failed.
        return {
            aiTitle: `(AI Error) ${title}`, 
            aiDescription: `(AI Error) ${description}`,
            aiStatus: "error"
        };
    }
}
exports.handler = async function(event, context) {

    const jsonResponse = (status, data) => ({
        statusCode: status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // <- fix: always present
            "Access-Control-Allow-Headers": "Content-Type, x-api-key",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        body: JSON.stringify(data)
    });

    // preflight requests
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, { message: "CORS OK" });
    }

    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { message: "CORS OK" });
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    try {
        const reqBody = JSON.parse(event.body || "{}");
        const ip = event.headers["x-forwarded-for"] || "unknown";
        if (!rateLimit(ip)) return jsonResponse(429, { error: "Rate limit exceeded. Please wait." });

        const { action, title = "", description = "", platform = "general" } = reqBody;

        if (action === "seo") {
            const seoResult = await generateSEO({ title, description, platform });
            return jsonResponse(200, seoResult);
        }

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
