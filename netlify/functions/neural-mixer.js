/**
 * RYGUYLABS - NEURAL MIXER BACKEND (Netlify Function)
 * Path: /netlify/functions/neural-mixer.js
 * * Secure processing for the Neural Vault interface.
 */

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*', // Replace with squarespace domain in production
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

    try {
        const body = JSON.parse(event.body);
        const protocol = body.protocol || 'GAMMA';
        const noiseType = body.noiseType || 'white';

        // 1. PROPRIETARY FREQUENCY TABLE
        const VAULT_PROTOCOLS = {
            'GAMMA': { base: 40.0, label: "OVERRIDE" },
            'BETA':  { base: 20.0, label: "EXECUTION" },
            'ALPHA': { base: 10.0, label: "STRATEGY" },
            'THETA': { base: 6.0,  label: "VISION" }
        };

        // 2. MASKING RATIO TABLE
        const MASKING_PROFILES = {
            'white': { ratio: 0.15, description: "ULTRA-WHITE STATIC" },
            'pink':  { ratio: 0.25, description: "DEEP PINK NEURAL" },
            'brown': { ratio: 0.35, description: "OBSIDIAN SUB-DEEP" },
            'none':  { ratio: 0.00, description: "NULL" }
        };

        const selected = VAULT_PROTOCOLS[protocol] || VAULT_PROTOCOLS['GAMMA'];
        const mask = MASKING_PROFILES[noiseType] || MASKING_PROFILES['white'];

        // 3. NON-LINEAR DRIFT ALGORITHM
        // Prevents neural adaptation by shifting frequency based on server-time harmonics
        const drift = Math.sin(Date.now() / 2000) * 0.08;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                frequency: selected.base,
                drift: drift,
                noiseRatio: mask.ratio,
                protocolLabel: selected.label,
                vaultKey: `RL-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
                status: "VAULT_LINK_STABLE"
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "VAULT_CONNECTION_FAILED", message: error.message })
        };
    }
};
