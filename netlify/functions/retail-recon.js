const API_KEY = process.env.RETAIL_RECON_KEY || "";

const MARKET_LOGIC = {
    // This replaces the static switch-case with a dynamic AI fetch
    calculateDynamic: async (platform, price, cost, weight, category) => {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.RETAIL_RECON_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `Act as a 2026 resale auditor. Calculate EXACT profit for ${platform}. 
Rules: 
- Poshmark: 20% fee ($2.95 if <$15), $0 shipping.
- eBay: 13.25% fee + $0.40, ${weight}lb shipping label cost.
- Etsy: 6.5% + 3.1% + $0.45, ${weight}lb shipping.
- StockX: 9% + 3%, $4 shipping.
Item: ${category} at $${price}, Cost: $${cost}, Weight: ${weight}lbs. 
Return ONLY JSON: {"fee": number, "shipping": number, "netProfit": number, "roi": number}` }] }]
                })
            });
            const data = await response.json();
            const raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(raw);
            return {
                net: parsed.netProfit || 0,
                fee: (parsed.fee + parsed.shipping) || 0,
                roi: parsed.roi || 0
            };
        } catch (err) {
            console.error("Math AI Error:", err);
            return { net: 0, fee: 0, roi: 0 }; // Failsafe
        }
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
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    const jsonResponse = (status, data) => ({
        statusCode: status,
        headers: headers,
        body: JSON.stringify(data)
    });

    if (event.httpMethod === "OPTIONS") return jsonResponse(200, { message: "CORS OK" });
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    try {
        const reqBody = JSON.parse(event.body || "{}");
        const ip = event.headers["x-forwarded-for"] || "unknown";
        if (!rateLimit(ip)) return jsonResponse(429, { error: "Rate limit exceeded." });

        const { action, title = "", description = "", platform = "general" } = reqBody;

        if (action === "seo") {
            const seoResult = await generateSEO({ title, description, platform });
            return jsonResponse(200, seoResult);
        }

        if (action === "arbitrage") {
            const { price, cost, weight, category, taxMode, marketSort } = reqBody;

            if ([price, cost, weight].some(v => typeof v !== "number")) {
                return jsonResponse(400, { error: "Please enter valid numbers." });
            }

            const results = await Promise.all([
                "poshmark", "ebay", "mercari", "depop", "stockx", "offerup", "etsy", "pinterest"
            ].map(async (platName) => {
                const calc = await MARKET_LOGIC.calculateDynamic(platName, price, cost, weight, category);
                let taxRate = taxMode === "sole" ? 0.153 : taxMode === "llc" ? 0.12 : 0;
                const postTaxNet = calc.net > 0 ? calc.net * (1 - taxRate) : calc.net;

                return {
                    name: platName,
                    net: postTaxNet,
                    fee: calc.fee,
                    roi: calc.roi,
                    postTax: postTaxNet,
                    days: 3,
                    risk: "Low",
                    complexity: "Low"
                };
            }));

            results.sort((a, b) => (marketSort === "roi") ? b.roi - a.roi : b.net - a.net);
            return jsonResponse(200, { results, topResult: results[0] });
        }

    } catch (err) {
        console.error("Retail Recon Error:", err);
        return jsonResponse(500, { error: "Internal server error", details: err.message });
    }
};
