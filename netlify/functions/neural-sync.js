/**
 * RYGUYLABS - NEURAL COCKPIT BACKEND (Netlify Function)
 * Path: /netlify/functions/neural-sync.js
 * * This file contains the proprietary frequency tables and 
 * adaptive modulation logic that must remain hidden from the frontend.
 */

exports.handler = async (event, context) => {
    // 1. Security Headers (CORS)
    const headers = {
        'Access-Control-Allow-Origin': '*', // In production, replace with your Squarespace domain
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle Preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers };
    }

    try {
        const body = JSON.parse(event.body);
        const protocol = body.protocol || 'GAMMA';
        const userId = body.userId || 'GUEST';

        // 2. Proprietary Protocol Table (THE MOAT)
        // These values are never exposed to the client until requested
        const PROTOCOL_TABLE = {
            'GAMMA': {
                base: 40.0,
                noiseRatio: 0.15,
                maskingMode: 'ULTRA-WHITE (SHARP)',
                isPremium: false
            },
            'BETA': {
                base: 20.0,
                noiseRatio: 0.25,
                maskingMode: 'PINK (FLOW)',
                isPremium: false
            },
            'ALPHA': {
                base: 10.0,
                noiseRatio: 0.35,
                maskingMode: 'BROWN (DEEP)',
                isPremium: false
            },
            'THETA': {
                base: 6.3,
                noiseRatio: 0.45,
                maskingMode: 'BROWN (DEEP)',
                isPremium: true // Access control happens here
            }
        };

        // 3. Premium Logic Check
        const selected = PROTOCOL_TABLE[protocol] || PROTOCOL_TABLE['GAMMA'];
        
        // Mock user check (You can expand this with a database later)
        const isUserPremium = false; 
        if (selected.isPremium && !isUserPremium) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: "PREMIUM_LOCKED", message: "Theta Protocol requires Tier 2 access." })
            };
        }

        // 4. Dynamic Frequency Drift (Proprietary Algorithm)
        // We introduce a slight, non-linear drift so the brain doesn't tune out the signal.
        // This is calculated on the server so it's unpredictable for the user.
        const timeFactor = Date.now() % 10000;
        const driftFactor = Math.sin(timeFactor / 1000) * 0.05; // Proprietary drift curve

        // 5. Build Response
        const responseData = {
            targetFreq: selected.base,
            maskingMode: selected.maskingMode,
            noiseRatio: selected.noiseRatio,
            driftFactor: driftFactor,
            sessionKey: Math.random().toString(36).substring(7), // Session handshake
            status: "ENCRYPTED_LINK_ACTIVE"
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "INTERNAL_SERVER_ERROR", message: error.message })
        };
    }
};
