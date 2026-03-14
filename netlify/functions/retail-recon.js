
const API_KEY = process.env.RETAIL_RECON_KEY || "";

const MARKET_LOGIC = {
    calculateDynamic: async (platform, price, cost, weight, category) => {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.RETAIL_RECON_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `Act as a 2026 resale auditor. Calculate EXACT payout (Sale - Fees) for ${platform}. 
Rules: 
- Amazon: 15% referral + $0.99 (Individual) + $0.08 surcharge.
- Walmart: 15% commission, $0 listing.
- Poshmark: 20% fee ($2.95 if <$15), $0 shipping.
- eBay: 13.6% fee + $0.40, ${weight}lb shipping.
- Mercari: 10% fee, 2.9%+$0.50 processing.
- Vinted: 0% seller fee, $0 shipping (Buyer pays).
- Depop: 0% fee, 3.3% + $0.45 processing.
- Grailed: 9% fee + 3.49% processing.
- StockX: 9% fee + 3% processing + $5 ship fee.
- Etsy: 6.5% + 3% + $0.25 + $0.20 listing fee.
- Pinterest/OfferUp: 0% fee (Local), 2.9%+$0.30 (if Ship).
Item: ${category} at $${price}, Cost: $${cost}, Weight: ${weight}lbs. 
Return ONLY JSON: {"fee": number, "shipping": number, "payout": number}` }] }]
                })
            });
            const data = await response.json();
            const raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(raw);
            return {
            payout: parsed.payout || 0,
            fee: (parsed.fee + parsed.shipping) || 0
            };
        } catch (err) {
            console.error("Math AI Error:", err);
            return { net: 0, fee: 0 }; 
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

            const platforms = [
                { id: "amazon", group: "High-Volume", label: "Amazon" },
                { id: "walmart", group: "High-Volume", label: "Walmart" },
                { id: "ebay", group: "Social Marketplace", label: "eBay" },
                { id: "poshmark", group: "Social Marketplace", label: "Poshmark" },
                { id: "mercari", group: "Social Marketplace", label: "Mercari" },
                { id: "vinted", group: "Social Marketplace", label: "Vinted" },
                { id: "depop", group: "Social Marketplace", label: "Depop" },
                { id: "grailed", group: "Specialized/Niche", label: "Grailed" },
                { id: "stockx", group: "Specialized/Niche", label: "StockX" },
                { id: "etsy", group: "Specialized/Niche", label: "Etsy" },
                { id: "offerup", group: "Local/Direct", label: "OfferUp" },
                { id: "pinterest", group: "Local/Direct", label: "Pinterest" }
            ];

            const results = await Promise.all(platforms.map(async (plat) => {
                const calc = await MARKET_LOGIC.calculateDynamic(plat.id, price, cost, weight, category);
                
                const trueProfit = calc.payout - cost;
// 2026 Accurate Tax Logic: 15.3% SE Tax + 10% Base Federal Estimate
let taxRate = 0;
if (taxMode === "sole") taxRate = 0.253; // 15.3% SE + 10% Fed
else if (taxMode === "llc") taxRate = 0.22; // LLCs typically estimated at 22% total
else taxRate = 0; // Hobby / No Tax

const taxAmount = trueProfit > 0 ? trueProfit * taxRate : 0;
const postTaxNet = trueProfit - taxAmount;

return {
    name: plat.label,
    group: plat.group,
    net: postTaxNet,
    taxPaid: taxAmount,
    fee: calc.fee,
    roi: cost > 0 ? Math.round((postTaxNet / cost) * 100) : 0
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
