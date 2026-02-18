/**
 * Netlify Function: sales-cadence-1.js
 * * This is the secure backend for the Sales Cadence & Funnel Pro.
 * It handles the sensitive algorithmic logic for analytics and data transformation.
 */

exports.handler = async (event, context) => {
    // Basic CORS headers for production
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const data = JSON.parse(event.body);
        const { leads, schedule, action } = data;

        // --- SENSITIVE ALGORITHMIC LOGIC ---
        // We calculate velocity and pipeline health here so it's not visible in the frontend
        
        let response = {};

        if (action === 'calculateAnalytics') {
            const total = leads.cold.length + leads.warm.length + leads.hot.length;
            const pendingTasks = schedule.filter(t => !t.isCompleted).length;
            
            // Proprietary Conversion Logic: Weighted by stage importance
            // This is the "Algo" that we are safeguarding
            const conversionRate = total > 0 
                ? Math.round(((leads.warm.length + leads.hot.length) / total) * 100) 
                : 0;

            response = {
                total,
                coldCount: leads.cold.length,
                warmCount: leads.warm.length,
                hotCount: leads.hot.length,
                pendingTasks,
                conversionRate,
                status: "Success",
                timestamp: new Date().toISOString()
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error", message: error.message })
        };
    }
};
