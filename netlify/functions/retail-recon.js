/**
 * retail-recon.js
 * RyGuyLabs – Sensitive market fee, profit & SEO logic
 */

const MARKET_LOGIC = {
    categories: {
        standard: { ebayFee: 0.1325, poshFee: 0.20, vol: 0.05 },
        electronics: { ebayFee: 0.08, poshFee: 0.20, vol: 0.15 },
        collectibles: { ebayFee: 0.12, poshFee: 0.20, vol: 0.10 },
        sneakers: { ebayFee: 0.00, poshFee: 0.20, vol: 0.08 },
        media: { ebayFee: 0.1495, poshFee: 0.20, vol: 0.03 }
    }
};

// Helper function for SEO generation
function generateSEO({ title, description, keywords }) {
    if (!title || !description) return { error: "Title and description required" };
    const seoTitle = `${title} | RyGuyLabs`;
    const seoDescription = description.length > 160 ? description.slice(0, 157) + "..." : description;
    const seoKeywords = keywords && Array.isArray(keywords) ? keywords.join(", ") : "";
    return { seoTitle, seoDescription, seoKeywords };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { action } = req.body;

        if (action === 'seo') {
            // SEO Generation Path
            const seoResult = generateSEO(req.body);
            return res.status(200).json(seoResult);
        }

        // Default: Retail recon path
        const { price, cost, weight, category, taxMode, marketSort, isReverseMode } = req.body;

        if ([price, cost, weight].some(v => typeof v !== 'number' || v < 0)) {
            return res.status(400).json({ error: 'Invalid numeric inputs' });
        }

        const activeFees = MARKET_LOGIC.categories[category] || MARKET_LOGIC.categories.standard;

        const platforms = [
            { name: 'Poshmark', risk: 'Low', baseRisk: 1, riskClass: 'risk-low', feeFn: p => p < 15 ? 2.95 : p * activeFees.poshFee, shipFn: w => w > 5 ? (w - 5) * 4.50 : 0, days: 5, logic: 'Buyer Pays Shipping', complexity: 'Low' },
            { name: 'eBay', risk: 'Med', baseRisk: 2, riskClass: 'risk-med', feeFn: p => (p * activeFees.ebayFee) + 0.30, shipFn: w => w <= 1 ? 5.50 : 8.50, days: 3, logic: 'Max Reach Search', complexity: 'High' },
            { name: 'StockX', risk: 'Low', baseRisk: 1, riskClass: 'risk-low', feeFn: p => p * 0.12, shipFn: w => 0, days: 14, logic: 'Authentication', complexity: 'Med' },
            { name: 'OfferUp', risk: 'High', baseRisk: 4, riskClass: 'risk-high', feeFn: p => 0, shipFn: w => 0, days: 1, logic: 'Local Cash', complexity: 'High' },
            { name: 'Depop', risk: 'Med', baseRisk: 2, riskClass: 'risk-med', feeFn: p => (p * 0.133) + 0.45, shipFn: w => 5.49, days: 4, logic: 'Gen Z Aesthetic', complexity: 'Low' },
            { name: 'Etsy', risk: 'Low', baseRisk: 1, riskClass: 'risk-low', feeFn: p => (p * 0.065) + 0.20, shipFn: w => 6.00, days: 7, logic: 'Vintage/Handmade', complexity: 'High' },
            { name: 'Mercari', risk: 'Med', baseRisk: 2, riskClass: 'risk-med', feeFn: p => (p * 0.10) + 0.50, shipFn: w => 7.40, days: 4, logic: 'Direct/Fast', complexity: 'Low' },
            { name: 'Pinterest', risk: 'Low', baseRisk: 1, riskClass: 'risk-low', feeFn: p => 0, shipFn: w => 0, days: 30, logic: 'Affiliate/Direct', complexity: 'High' }
        ];

        let taxRate = 0;
        if(taxMode === 'sole') taxRate = 0.153;
        if(taxMode === 'llc') taxRate = 0.12;

        const results = platforms.map(plat => {
            let p = price;
            let net = 0;

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

            const postTaxNet = net - (net * taxRate);
            const roi = (postTaxNet / cost) * 100;
            const yieldPerDay = postTaxNet / plat.days;
            const adjRisk = plat.baseRisk + (activeFees.vol * 10);

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

        // Sort based on frontend-selected mode
        results.sort((a, b) => {
            if (marketSort === 'net') return b.postTax - a.postTax;
            if (marketSort === 'roi') return b.roi - a.roi;
            if (marketSort === 'speed') return b.yieldPerDay - a.yieldPerDay;
            if (marketSort === 'risk') return a.adjRisk - b.adjRisk;
            return b.postTax - a.postTax;
        });

        res.status(200).json({ results, topResult: results[0] });

    } catch (err) {
        console.error("Retail Recon Error:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
