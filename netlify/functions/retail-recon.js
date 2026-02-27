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

// Enhanced generateSEO with optional AI rewrite
function generateSEO({ title, description, platform = "general" }) {
    if (!title || !description) {
        return { error: "Title and description required" };
    }

    const raw = `${title} ${description}`;

    // Tokenize input
    const tokens = raw
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(Boolean);

    const conditionWords = ["new", "excellent", "mint", "used", "good", "fair"];
    const detectedCondition = tokens.find(t => conditionWords.includes(t.toLowerCase()));

    const sizeMatch = raw.match(/\b(XXL|XL|L|M|S|XS|\d{1,2})\b/i);
    const detectedSize = sizeMatch ? sizeMatch[0] : "";

    const brandMatch = raw.match(/\b[A-Z][a-zA-Z]+\b/);
    const detectedBrand = brandMatch ? brandMatch[0] : "";

    const stopwords = ["the", "and", "with", "for", "on", "in", "at", "a"];
    const filteredTokens = tokens.filter(t => !stopwords.includes(t.toLowerCase()));

    const primaryKeywords = filteredTokens.slice(0, 6).join(" ");

    let seoTitle = "";
    let seoDescription = "";
    let styleTags = [];

    switch (platform.toLowerCase()) {
        case "ebay":
            seoTitle = `${detectedBrand} ${primaryKeywords} ${detectedSize} ${detectedCondition || ""}`
                .replace(/\s+/g, " ").trim().slice(0, 80);

            seoDescription = `Selling this ${detectedBrand} ${primaryKeywords} ${detectedSize} in ${detectedCondition || "great condition"}. ` +
                `Perfect for collectors or everyday use. Fast shipping and trusted seller.`;

            styleTags = filteredTokens.slice(0, 10).map(t => t.toLowerCase());
            break;

        case "poshmark":
            seoTitle = `${primaryKeywords} ${detectedSize}`.trim().slice(0, 100);

            seoDescription = `Upgrade your wardrobe with this ${primaryKeywords} ${detectedSize}. ` +
                `Condition: ${detectedCondition || "Excellent"}. Modern style meets comfort. ` +
                `Limited availability, get it now!`;

            styleTags = ["fashion", "trendy", "vintage", "streetwear", "sale"]
                .concat(filteredTokens.slice(0, 5));
            break;

        case "etsy":
            seoTitle = `${primaryKeywords} | ${detectedBrand} ${detectedSize}`.trim().slice(0, 140);

            seoDescription = `Handcrafted ${primaryKeywords} by ${detectedBrand}. ` +
                `Perfect for gifting or personal use. Condition: ${detectedCondition || "High Quality"}. ` +
                `Unique item made with care and attention to detail.`;

            styleTags = ["handmade", "unique", "gift", "custom", "craft"].concat(filteredTokens.slice(0, 5));
            break;

        case "mercari":
            seoTitle = `${primaryKeywords} ${detectedSize}`.trim().slice(0, 90);

            seoDescription = `Quickly sell your ${primaryKeywords} ${detectedSize}. ` +
                `Condition: ${detectedCondition || "See photos"}. Fast shipping and ready to buy.`;

            styleTags = ["resale", "fastship", "budget"].concat(filteredTokens.slice(0, 5));
            break;

        default:
            seoTitle = primaryKeywords.slice(0, 100);
            seoDescription = description.slice(0, 200);
            styleTags = filteredTokens.slice(0, 10);
    }

    return {
        seoTitle: seoTitle.trim(),
        seoDescription: seoDescription.trim(),
        seoKeywords: filteredTokens.join(", "),
        styleTags
    };
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
    return jsonResponse(200, generateSEO({
        title: reqBody.title,
        description: reqBody.description,
        keywords: reqBody.keywords,
        platform: reqBody.platform
    }));
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
