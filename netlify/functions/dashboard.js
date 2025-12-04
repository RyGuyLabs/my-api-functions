import { GoogleGenAI } from "@google/genai";

// Initialize the GoogleGenAI SDK.
// It automatically uses the GEMINI_API_KEY environment variable.
// Since you are using FIRST_API_KEY, we will pass it directly.
const ai = new GoogleGenAI({ apiKey: process.env.FIRST_API_KEY });

// This is the main handler for your Netlify function.
export async function handler(event, context) {
    // -----------------------------------------------------
    // 1. CORS Preflight Handling (Kept as is)
    // -----------------------------------------------------
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: "",
        };
    }

    // -----------------------------------------------------
    // 2. Parse Request and Map Prompts (Kept as is)
    // -----------------------------------------------------
    if (event.httpMethod !== "POST" || !event.body) {
        return { statusCode: 405, body: "Method Not Allowed or Missing Body" };
    }
    
    let feature, data;
    try {
        ({ feature, data } = JSON.parse(event.body));
    } catch (e) {
        return { statusCode: 400, body: "Invalid JSON in request body" };
    }

    // This object maps the 'feature' name from Squarespace to the correct AI prompt
    const promptMap = {
        lead_idea: ({ userName, userCompany, name, company, purpose, formOfContact }) => `
You are a master sales copywriter and strategist. You work for a company named ${userCompany} and your name is ${userName}. Write a detailed, persuasive, and memorable outreach message for ${name} at ${company}.
The message must be delivered in the style of ${formOfContact} (e.g., phone script, LinkedIn DM, cold email, etc.).
The purpose of this outreach is: "${purpose}".

Requirements:
- Open with a strong, attention-grabbing first line tailored to ${name}.
- Be clear, confident, and motivating while staying authentic.
- Highlight value to ${company}, not just what’s being sold.
- Include persuasive language that resonates emotionally and logically.
- Conclude with a natural, compelling next step that encourages engagement.
- Do NOT use placeholders like [insert product] — fill the message in fully as if it’s ready to send.

Make it polished, powerful, and unique — something a top sales rep would be proud to deliver.
`,
        nurturing_note: ({ userName, userCompany, name, company, purpose, formOfContact }) => `
You are a relationship-building expert. You work for a company named ${userCompany} and your name is ${userName}. Write a thoughtful, kind, and professional nurturing note that could be sent to ${name} at ${company}.
This note should follow up naturally on the outreach regarding "${purpose}" via ${formOfContact}.

Requirements:
- Keep the tone warm, personable, and genuine.
- Express care or insight without being pushy.
- Offer a touch of positivity, inspiration, or value that strengthens rapport.
- End with an inviting, open-ended sentiment that leaves the door open for future conversation.

Make it memorable and uplifting — the kind of note that makes ${name} feel respected, valued, and glad they heard from you.
`,
        daily_inspiration: () => `
You are a motivational coach. Provide a short, actionable, and inspiring message to help a user start their workday with confidence. Your response MUST end with a line break followed by the exact phrase: "\nYou Got This with RyGuyLabs".
`,
        breakdown_goals: ({ bigGoal }) => `
You are an expert project manager. Take this large goal: "${bigGoal}" and break it down into 5-7 clear, actionable, and measurable steps. The steps should be formatted as a numbered list. Your response MUST end with a line break followed by the exact phrase: "\nYou Got This with RyGuyLabs".
`,
        summarize_goals: ({ morningGoals, afternoonGoals, eveningGoals }) => `
You are a productivity expert. Summarize the following daily goals into a single, concise, and motivating paragraph. Your response MUST end with a line break followed by the exact phrase: "\nYou Got This with RyGuyLabs".
Morning Goals: ${morningGoals}
Afternoon Goals: ${afternoonGoals}
Evening Goals: ${eveningGoals}
`,
        morning_briefing: ({ leads, goals, industry, size, location }) => {
            const leadsText = leads.length > 0 ? "Leads to review:\n" + leads.map(lead => `- ${lead.name} at ${lead.company} (Status: ${lead.status})`).join("\n") : "";
            const goalsText = (goals.morning || goals.afternoon || goals.evening) ? "Today's goals:\n" + [goals.morning, goals.afternoon, goals.evening].filter(g => g).join('\n') : "";

            return `
You are a strategic business advisor. Provide a concise, actionable morning briefing for today. Your briefing should be a maximum of three short paragraphs.
First, provide a quick review of the user's leads and goals for the day, and also suggest 3 new leads to pursue. The suggested leads should be in the ${industry} industry, be a company of ${size} in ${location}.
Second, highlight the most important action to take today to move a hot lead forward.
Third, provide a closing summary and motivational push.
Respond as a single, cohesive briefing.
${leadsText}
${goalsText}
`;
        }
    };

    // Check if the requested feature exists in our map
    if (!promptMap[feature]) {
        return {
            statusCode: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ text: `Unknown feature: ${feature}` }),
        };
    }

    try {
        const apiPrompt = promptMap[feature](data);

        // -----------------------------------------------------
        // 3. REVISED AI API CALL USING THE GOOGLE GENAI SDK
        // -----------------------------------------------------
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Using the approved model
            contents: [
                {
                    role: "user",
                    parts: [{ text: apiPrompt }],
                },
            ],
            config: {
                maxOutputTokens: 600,
                temperature: 0.9,
            },
        });

        // Extract the text using the SDK's safe response structure
        import { GoogleGenAI } from "@google/genai";

// Initialize the GoogleGenAI SDK.
// It automatically uses the GEMINI_API_KEY environment variable.
// Since you are using FIRST_API_KEY, we will pass it directly.
const ai = new GoogleGenAI({ apiKey: process.env.FIRST_API_KEY });

// This is the main handler for your Netlify function.
export async function handler(event, context) {
    // -----------------------------------------------------
    // 1. CORS Preflight Handling (Kept as is)
    // -----------------------------------------------------
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: "",
        };
    }

    // -----------------------------------------------------
    // 2. Parse Request and Map Prompts (Kept as is)
    // -----------------------------------------------------
    if (event.httpMethod !== "POST" || !event.body) {
        return { statusCode: 405, body: "Method Not Allowed or Missing Body" };
    }
    
    let feature, data;
    try {
        ({ feature, data } = JSON.parse(event.body));
    } catch (e) {
        return { statusCode: 400, body: "Invalid JSON in request body" };
    }

    // This object maps the 'feature' name from Squarespace to the correct AI prompt
    const promptMap = {
        lead_idea: ({ userName, userCompany, name, company, purpose, formOfContact }) => `
You are a master sales copywriter and strategist. You work for a company named ${userCompany} and your name is ${userName}. Write a detailed, persuasive, and memorable outreach message for ${name} at ${company}.
The message must be delivered in the style of ${formOfContact} (e.g., phone script, LinkedIn DM, cold email, etc.).
The purpose of this outreach is: "${purpose}".

Requirements:
- Open with a strong, attention-grabbing first line tailored to ${name}.
- Be clear, confident, and motivating while staying authentic.
- Highlight value to ${company}, not just what’s being sold.
- Include persuasive language that resonates emotionally and logically.
- Conclude with a natural, compelling next step that encourages engagement.
- Do NOT use placeholders like [insert product] — fill the message in fully as if it’s ready to send.

Make it polished, powerful, and unique — something a top sales rep would be proud to deliver.
`,
        nurturing_note: ({ userName, userCompany, name, company, purpose, formOfContact }) => `
You are a relationship-building expert. You work for a company named ${userCompany} and your name is ${userName}. Write a thoughtful, kind, and professional nurturing note that could be sent to ${name} at ${company}.
This note should follow up naturally on the outreach regarding "${purpose}" via ${formOfContact}.

Requirements:
- Keep the tone warm, personable, and genuine.
- Express care or insight without being pushy.
- Offer a touch of positivity, inspiration, or value that strengthens rapport.
- End with an inviting, open-ended sentiment that leaves the door open for future conversation.

Make it memorable and uplifting — the kind of note that makes ${name} feel respected, valued, and glad they heard from you.
`,
        daily_inspiration: () => `
You are a motivational coach. Provide a short, actionable, and inspiring message to help a user start their workday with confidence. Your response MUST end with a line break followed by the exact phrase: "\nYou Got This with RyGuyLabs".
`,
        breakdown_goals: ({ bigGoal }) => `
You are an expert project manager. Take this large goal: "${bigGoal}" and break it down into 5-7 clear, actionable, and measurable steps. The steps should be formatted as a numbered list. Your response MUST end with a line break followed by the exact phrase: "\nYou Got This with RyGuyLabs".
`,
        summarize_goals: ({ morningGoals, afternoonGoals, eveningGoals }) => `
You are a productivity expert. Summarize the following daily goals into a single, concise, and motivating paragraph. Your response MUST end with a line break followed by the exact phrase: "\nYou Got This with RyGuyLabs".
Morning Goals: ${morningGoals}
Afternoon Goals: ${afternoonGoals}
Evening Goals: ${eveningGoals}
`,
        morning_briefing: ({ leads, goals, industry, size, location }) => {
            const leadsText = leads.length > 0 ? "Leads to review:\n" + leads.map(lead => `- ${lead.name} at ${lead.company} (Status: ${lead.status})`).join("\n") : "";
            const goalsText = (goals.morning || goals.afternoon || goals.evening) ? "Today's goals:\n" + [goals.morning, goals.afternoon, goals.evening].filter(g => g).join('\n') : "";

            return `
You are a strategic business advisor. Provide a concise, actionable morning briefing for today. Your briefing should be a maximum of three short paragraphs.
First, provide a quick review of the user's leads and goals for the day, and also suggest 3 new leads to pursue. The suggested leads should be in the ${industry} industry, be a company of ${size} in ${location}.
Second, highlight the most important action to take today to move a hot lead forward.
Third, provide a closing summary and motivational push.
Respond as a single, cohesive briefing.
${leadsText}
${goalsText}
`;
        }
    };

    // Check if the requested feature exists in our map
    if (!promptMap[feature]) {
        return {
            statusCode: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ text: `Unknown feature: ${feature}` }),
        };
    }

    try {
        const apiPrompt = promptMap[feature](data);

        // -----------------------------------------------------
        // 3. REVISED AI API CALL USING THE GOOGLE GENAI SDK
        // -----------------------------------------------------
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Using the approved model
            contents: [
                {
                    role: "user",
                    parts: [{ text: apiPrompt }],
                },
            ],
            config: {
                maxOutputTokens: 600,
                temperature: 0.9,
            },
        });

        // Extract the text using the SDK's safe response structure
        const aiText =
        response?.candidates?.[0]?.content?.[0]?.text || "No response received from AI.";


        // -----------------------------------------------------
        // 4. Return Success Response
        // -----------------------------------------------------
        return {
            statusCode: 200,
            headers: {
                // Ensure all CORS headers are present on success
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: JSON.stringify({
                text: aiText || "No response received from AI.",
            }),
        };
    } catch (e) {
        console.error("Server or AI SDK Error:", e);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ text: "Server error: " + (e.message || "An unknown error occurred.") }),
        };
    }
}
        // -----------------------------------------------------
        // 4. Return Success Response
        // -----------------------------------------------------
        return {
            statusCode: 200,
            headers: {
                // Ensure all CORS headers are present on success
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: JSON.stringify({
                text: aiText || "No response received from AI.",
            }),
        };
    } catch (e) {
        console.error("Server or AI SDK Error:", e);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ text: "Server error: " + (e.message || "An unknown error occurred.") }),
        };
    }
}
