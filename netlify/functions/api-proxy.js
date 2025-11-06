// --- GLOBAL SETUP FOR DATA & SECURITY ---
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'a-strong-fallback-secret-for-token-validation'; // MUST be set in ENV!
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Base URL for the Firestore REST API
const FIRESTORE_BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

// --- SECURITY & LIMITS CONFIGURATION ---
const MAX_GOAL_LENGTH = 2000;    // Max characters for user goals/text input

// --- DYNAMIC LIMITS ---
function getDailyLimit(tier) {
    switch (tier) {
        case 'premium': return 100;    // premium: highest limit
        case 'paid': return 50;        // standard paid: medium limit
        case 'free': return 10;        // free tier: small limit
        default: return 5;             // fallback for unknown/unauthenticated tier
    }
}

// --- ERROR CODES ---
const CustomErrorCodes = {
    INVALID_INPUT: 'INVALID_INPUT',
    UNAUTHORIZED: 'UNAUTHORIZED',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    MEMBERSHIP_INACTIVE: 'MEMBERSHIP_INACTIVE',
    UPGRADE_REQUIRED: 'UPGRADE_REQUIRED', // New code for tier-based feature block
    FIRESTORE_ERROR: 'FIRESTORE_ERROR',
    AI_API_ERROR: 'AI_API_ERROR',
    JSON_PARSING_ERROR: 'JSON_PARSING_ERROR',
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
};

// --- CACHING SETUP (Map with LRU Logic and TTL) ---
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;
const membershipCache = new Map();

// --- FEATURE CONFIGURATION ---
const FeatureConfig = {
    // All features that use Gemini for text generation
    TEXT_GENERATION_FEATURES: [
      "plan", "pep_talk", "vision_prompt", "obstacle_analysis",
      "positive_spin", "mindset_reset", "objection_handler",
      "smart_goal_structuring",
      "dream_energy_analysis"
    ],
    HIGH_COST_AI_FEATURES: [
      "smart_goal_structuring",
      "dream_energy_analysis"
    ]
};

// Map S.M.A.R.T. characteristic to a default icon
const SMART_ICON_DEFAULTS = {
    specific: "🎯", measurable: "📊", achievable: "💪", relevant: "🔗", timeBound: "📅" 
};

// Map normalized lowercase importance level to frontend style hints
const IMPORTANCE_MAP = {
    "high": { colorCode: "#059669", tooltip: "This is a critical component for success. Focus energy here." }, 
    "medium": { colorCode: "#fbbf24", tooltip: "This factor is well-balanced and manageable." }, 
    "low": { colorCode: "#ef4444", tooltip: "This area may need strengthening or re-evaluation." }, 
    "tbd": { colorCode: "#6b7280", tooltip: "Data missing from AI. Review and regenerate." } 
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization', 
  'Content-Type': 'application/json' 
};

// --- UTILITY FUNCTIONS (Logging, Conversions, Retry, JSON Extraction) ---
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

function log(level, message, context = {}) {
    const logMessage = `[${level}] ${message}`;
    const fullLog = context.userId || context.feature ? 
        `${logMessage} | Feature: ${context.feature || 'N/A'}, User: ${context.userId || 'N/A'}` :
        logMessage;
    
    if (IS_PRODUCTION && level === 'ERROR' && context.isExternalAPIError) {
        level = 'WARN';
    }

    if (level === 'ERROR' || level === 'FATAL') {
        console.error(fullLog, context.details || '');
    } else if (level === 'WARN') {
        console.warn(fullLog, context.details || '');
    } else {
        console.log(fullLog, context.details || '');
    }
}

function jsToFirestoreRest(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(jsToFirestoreRest) } };
    }
    if (typeof value === 'object') {
        const mapFields = {};
        for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            mapFields[key] = jsToFirestoreRest(value[key]);
        }
        }
        return { mapValue: { fields: mapFields } };
    }
    return { stringValue: String(value) };
}

function firestoreRestToJs(firestoreField) {
    if (!firestoreField) return null;
    if (firestoreField.nullValue !== undefined) return null;
    if (firestoreField.stringValue !== undefined) return firestoreField.stringValue;
    if (firestoreField.integerValue !== undefined) return parseInt(firestoreField.integerValue, 10);
    if (firestoreField.doubleValue !== undefined) return firestoreField.doubleValue;
    if (firestoreField.booleanValue !== undefined) return firestoreField.booleanValue;
    if (firestoreField.timestampValue !== undefined) return new Date(firestoreField.timestampValue).toISOString();
    if (firestoreField.arrayValue) {
        return (firestoreField.arrayValue.values || []).map(firestoreRestToJs);
    }
    if (firestoreField.mapValue) {
        const jsObject = {};
        const fields = firestoreField.mapValue.fields || {};
        for (const key in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            jsObject[key] = firestoreRestToJs(fields[key]);
        }
        }
        return jsObject;
    }
    return null;
}

async function fetchWithRetry(url, options, context = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options); 
      
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }
      
      if (response.status === 429) {
          const delay = 5000; 
          log('WARN', `External API Rate Limited (429). Waiting ${delay}ms...`, context);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; 
      }

      if (response.status >= 500) {
        if (attempt < maxRetries - 1) {
             const errorBody = await response.clone().text(); 
             log('WARN', `External API 5XX Error. Retrying. Status: ${response.status}`, { 
                 ...context, 
                 details: errorBody.substring(0, 200) + '...' 
             });
        }
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 500); 
        log('INFO', `Attempt ${attempt + 1}/${maxRetries} failed with status ${response.status}. Retrying in ${delay.toFixed(0)}ms...`, context);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; 
      }
      
      return response; 
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 500);
        log('WARN', `Network error on attempt ${attempt + 1}/${maxRetries}. Retrying in ${delay.toFixed(0)}ms...`, context);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; 
      }
    }
  }
  throw new Error("Maximum fetch retries reached.");
}

function extractJsonFromText(text) {
    try {
        const cleanText = text.trim().replace(/\u200B/g, "");
        const startIndex = cleanText.indexOf('{');
        const endIndex = cleanText.lastIndexOf('}');
        
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            return { error: true, code: CustomErrorCodes.JSON_PARSING_ERROR };
        }

        let jsonString = cleanText.substring(startIndex, endIndex + 1);
        jsonString = jsonString.replace(/,\s*([\}\]])/g, '$1'); 
        
        return JSON.parse(jsonString);

    } catch (e) {
        log('ERROR', "[JSON_EXTRACTION_PARSE_ERROR] Failed to parse JSON.", { details: e.message });
        return { error: true, code: CustomErrorCodes.JSON_PARSING_ERROR };
    }
}

// --- CORE SECURITY FUNCTIONS ---
function getUsageDocumentPath(userId) {
    const today = new Date().toISOString().split('T')[0]; 
    return `users/${userId}/usage/${today}`;
}

/**
 * Checks and increments the daily usage counter in Firestore based on the user's tier.
 * @returns The new request count, or -1 if the limit is exceeded.
 */
async function checkRateLimit(userId, feature, context, tier) {
    const dailyLimit = getDailyLimit(tier);
    const path = getUsageDocumentPath(userId);
    const firestoreUrl = `${FIRESTORE_BASE_URL}${path}?key=${FIRESTORE_KEY}`;

    let currentCount = 0;
    
    try {
        const getRes = await fetchWithRetry(firestoreUrl, { method: 'GET' }, context);
        
        if (getRes.status === 200) {
            const doc = await getRes.json();
            const fields = firestoreRestToJs({ mapValue: { fields: doc.fields } });
            currentCount = fields?.count || 0;
        } else if (getRes.status !== 404) {
             log('WARN', `Rate limit GET failed with status ${getRes.status}. Continuing, but logging.`, context);
        }

        const newCount = currentCount + 1;

        if (newCount > dailyLimit) {
            log('WARN', `Rate limit exceeded for user (Tier: ${tier}). Count: ${newCount} / ${dailyLimit}`, context);
            return -1; 
        }

        const newFields = jsToFirestoreRest({ 
            count: newCount, 
            last_feature: feature,
            tier: tier,
            timestamp: new Date().toISOString()
        });
        
        const upsertMethod = (getRes.status === 200) ? 'PATCH' : 'POST';
        let upsertUrl = firestoreUrl;
        
        if (upsertMethod === 'POST') {
             upsertUrl = `${FIRESTORE_BASE_URL}users/${userId}/usage?documentId=${path.split('/').pop()}&key=${FIRESTORE_KEY}`;
        }

        const upsertRes = await fetchWithRetry(upsertUrl, {
            method: upsertMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: newFields.mapValue.fields })
        }, context);

        if (!upsertRes.ok) {
            log('ERROR', `Rate limit UPSERT failed. Status: ${upsertRes.status}`, context);
        }

        return newCount;

    } catch (error) {
        log('ERROR', `Rate limit check failed unexpectedly.`, { ...context, details: error.message });
        return currentCount + 1; 
    }
}

// --- SQUARESPACE MEMBERSHIP FETCH ---
async function fetchMembership(userId) {
    if (!SQUARESPACE_TOKEN) return { isActive: false, tier: 'free' };

    // Check cache
    const cached = membershipCache.get(userId);
    if (cached && cached.expiry > Date.now()) return { isActive: cached.isActive, tier: cached.tier };

    let membershipStatus = { isActive: false, tier: 'free' };
    try {
        const res = await fetchWithRetry(`https://api.squarespace.com/1.0/profiles/check-membership/${userId}`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${SQUARESPACE_TOKEN}`,
                'User-Agent': 'RyGuyLabs-Netlify-Function'
            }
        }, { userId: userId, feature: 'AUTH' });

        if (res.ok) {
            const data = await res.json();
            const isActive = data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';
            const tier = isActive ? (data.planName?.toLowerCase().includes('premium') ? 'premium' : 'paid') : 'free';
            membershipStatus = { isActive, tier };
        } else {
            log('WARN', `Squarespace API returned status ${res.status}`, { userId, feature: 'AUTH', isExternalAPIError: true });
        }
    } catch (error) {
        log('ERROR', "Squarespace API failed during fetch.", { userId, feature: 'AUTH', details: error.message, isExternalAPIError: true });
    }

    // Cache result
    membershipCache.set(userId, { ...membershipStatus, expiry: Date.now() + CACHE_TTL });
    return membershipStatus;
}

// --- PLACEHOLDER AUTH TOKEN VERIFICATION ---
function verifyAuthToken(userId, authToken) {
    // Simple placeholder: In production, implement JWT/session validation
    if (!authToken || !userId) return false;
    return true;
}

// --- MAIN HANDLER ---
exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    if (IS_PRODUCTION && (!GEMINI_API_KEY || !FIRESTORE_KEY || !PROJECT_ID || !SQUARESPACE_TOKEN || !SESSION_SECRET)) {
        log('FATAL', 'Missing critical API keys/secrets in production environment. Immediate fail.');
        return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Service Unavailable: Critical configuration missing.' }) };
    }

    let body;
    try { body = event.body ? JSON.parse(event.body) : {}; } 
    catch (e) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Invalid JSON body.', code: CustomErrorCodes.INVALID_INPUT }) }; }

    const authToken = event.headers.authorization ? event.headers.authorization.split('Bearer ')[1] : null;
    const { operation, action, userId, data, userGoal, textToSpeak, voice } = body;
    const feature = operation || action || body.feature;
    const context = { userId, feature };

    if (!verifyAuthToken(userId, authToken)) {
        log('WARN', 'Unauthorized access attempt: Invalid or missing token.', context);
        return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Unauthorized: Invalid session token or missing userId.', code: CustomErrorCodes.UNAUTHORIZED }) };
    }

    if (!feature) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required "operation" or "action" parameter.', code: CustomErrorCodes.INVALID_INPUT }) };
    }

    const membership = userId ? await fetchMembership(userId) : { isActive: false, tier: 'free' };

    try {
        // --- DATA OPERATIONS (SAVE/LOAD/DELETE DREAMS) ---
        if (['SAVE_DREAM','LOAD_DREAMS','DELETE_DREAM'].includes(feature.toUpperCase())) {
            if (!userId) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Missing userId for data access.`, code: CustomErrorCodes.UNAUTHORIZED }) };
            if (!membership.isActive) return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Forbidden: No active RyGuyLabs membership found.', code: CustomErrorCodes.MEMBERSHIP_INACTIVE }) };

            const dreamDocumentPath = `users/${userId}/dreams`;
            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM': {
                    if (!data) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Missing data to save.`, code: CustomErrorCodes.INVALID_INPUT }) };
                    const saveData = { ...data, timestamp: new Date().toISOString() };
                    const firestoreRest = jsToFirestoreRest(saveData);
                    const firestoreFields = firestoreRest.mapValue ? firestoreRest.mapValue.fields : null;
                    if (!firestoreFields) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Invalid data format for saving.`, code: CustomErrorCodes.INVALID_INPUT }) };

                    const res = await fetchWithRetry(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: firestoreFields }) }, context);
                    if (!res.ok) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Firestore save failed.`, code: CustomErrorCodes.FIRESTORE_ERROR }) };
                    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Dream saved successfully.' }) };
                }
                case 'LOAD_DREAMS': {
                    const res = await fetchWithRetry(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, { method: 'GET' }, context);
                    if (!res.ok) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Firestore load failed.`, code: CustomErrorCodes.FIRESTORE_ERROR }) };
                    const doc = await res.json();
                    const fields = firestoreRestToJs({ mapValue: { fields: doc.fields || {} } });
                    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ dreams: fields || [] }) };
                }
                case 'DELETE_DREAM': {
                    if (!data?.dreamId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Missing dreamId to delete.`, code: CustomErrorCodes.INVALID_INPUT }) };
                    const res = await fetchWithRetry(`${FIRESTORE_BASE_URL}${dreamDocumentPath}/${data.dreamId}?key=${FIRESTORE_KEY}`, { method: 'DELETE' }, context);
                    if (!res.ok) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Firestore delete failed.`, code: CustomErrorCodes.FIRESTORE_ERROR }) };
                    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Dream deleted successfully.' }) };
                }
            }
        }

        // --- RATE LIMIT CHECK ---
        if (membership.isActive) {
            const currentCount = await checkRateLimit(userId, feature, context, membership.tier);
            if (currentCount === -1) return { statusCode: 429, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Rate limit exceeded. Please try again tomorrow.', code: CustomErrorCodes.RATE_LIMIT_EXCEEDED }) };
        } else {
            return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Membership inactive. Upgrade to access AI features.', code: CustomErrorCodes.UPGRADE_REQUIRED }) };
        }

        // --- TEXT GENERATION FEATURES ---
        if (FeatureConfig.TEXT_GENERATION_FEATURES.includes(feature)) {
            if (!data?.prompt) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `[${feature}] Missing "prompt".`, code: CustomErrorCodes.INVALID_INPUT }) };

            if (FeatureConfig.HIGH_COST_AI_FEATURES.includes(feature) && membership.tier === 'free') {
                return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Upgrade required for this premium feature.', code: CustomErrorCodes.UPGRADE_REQUIRED }) };
            }

            const gptResponse = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GEMINI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4.1-mini',
                    messages: [{ role: 'user', content: data.prompt }],
                    temperature: 0.7,
                    max_tokens: 1200
                })
            }, context);

            const resultJson = await gptResponse.json();
            let finalContent = resultJson?.choices?.[0]?.message?.content || '';
            
            if (['smart_goal_structuring','dream_energy_analysis'].includes(feature)) {
                finalContent = extractJsonFromText(finalContent);
                if (finalContent?.error) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'JSON generation failed', code: CustomErrorCodes.JSON_PARSING_ERROR }) };
            }

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ result: finalContent }) };
        }

        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Feature not recognized or implemented yet.', code: CustomErrorCodes.INVALID_INPUT }) };

    } catch (error) {
        log('ERROR', 'Unexpected error in handler.', { ...context, details: error.message });
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Internal server error.', code: CustomErrorCodes.INTERNAL_SERVER_ERROR }) };
    }
};
