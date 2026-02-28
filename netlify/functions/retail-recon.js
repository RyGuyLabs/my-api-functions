const API_KEY = process.env.RETAIL_RECON_KEY || "";

const MARKET_LOGIC = {
    calculate: (platform, price, weight, category, cost) => {
        let fee = 0;
        let shipping = 0;
        const p = parseFloat(price) || 0;
        const w = parseFloat(weight) || 0;
        const c = parseFloat(cost) || 0;
        const shipCost = w <= 1 ? 6.50 : w <= 5 ? 8.27 : 12.00;

        switch (platform) {
            case 'poshmark':
                fee = p < 15 ? 2.95 : p * 0.20;
                shipping = 0; // Buyer pays
                break;
            case 'ebay':
                const rate = MARKET_LOGIC.categories[category]?.ebayFee || 0.136;
                fee = ((p + shipCost) * rate) + 0.30;
                shipping = shipCost; // Seller pays
                break;
            case 'mercari':
                fee = (p * 0.10) + 0.50;
                shipping = 0; // Buyer pays
                break;
            case 'depop':
                fee = (p * 0.033) + 0.45;
                shipping = 0;
                break;
        }
        const payout = p - fee - shipping;
        const netProfit = payout - c; 
        return { 
            net: netProfit || 0, 
            fee: (fee + shipping) || 0, 
            roi: c > 0 ? ((netProfit / c) * 100) : 0 
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

        // --- ARBITRAGE TOOL LOGIC ---
        if (action === "arbitrage") {
            const { price, cost, weight, category, taxMode, marketSort } = reqBody;

            // Safety check for inputs
            if ([price, cost, weight].some(v => typeof v !== "number")) {
                return jsonResponse(400, { error: "Please enter valid numbers." });
            }

            const results = [
                "poshmark", "ebay", "mercari", "depop", "stockx", "offerup", "etsy", "pinterest"
            ].map(platName => {
                // Passed 'cost' to calculate real profit
                const calc = MARKET_LOGIC.calculate(platName, price, weight, category, cost);
                
                let taxRate = taxMode === "sole" ? 0.153 : taxMode === "llc" ? 0.12 : 0;
                // Tax only applies if there is actual profit
                const postTaxNet = calc.net > 0 ? calc.net * (1 - taxRate) : calc.net;
                
                const meta = {
                    poshmark: { days: 5, risk: "Low", complexity: "Low" },
                    ebay: { days: 3, risk: "Med", complexity: "High" },
                    mercari: { days: 4, risk: "Med", complexity: "Low" },
                    depop: { days: 4, risk: "Med", complexity: "Low" }
                }[platName] || { days: 7, risk: "Low", complexity: "Med" };

                return {
                    name: platName,
                    net: postTaxNet || 0,
                    fee: calc.fee || 0,
                    roi: calc.roi || 0,
                    postTax: postTaxNet || 0,
                    days: meta.days,
                    risk: meta.risk,
                    complexity: meta.complexity
                };
            });

            results.sort((a, b) => (marketSort === "roi") ? b.roi - a.roi : b.net - a.net);
            return jsonResponse(200, { results, topResult: results[0] });
        }

    } catch (err) {
        console.error("Retail Recon Error:", err);
        return jsonResponse(500, { error: "Internal server error" });
    }
};
