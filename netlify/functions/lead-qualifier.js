import fetch from 'node-fetch';

export const handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers };
    }

    const path = event.path.replace(/\.netlify\/functions\/[^/]+/, '');

    try {
        const body = JSON.parse(event.body);

        // --- Handle Cadence Generation Request ---
        if (path === '/generate-cadence') {
            const { leadData, reportData } = body;

            // Your Cadence generation logic (from previous response)
            const geminiPrompt = `
You are a professional sales strategist. Using the provided qualification report and lead data, generate a structured, multi-step sales cadence plan.

**Instructions:**
- Create a plan with 4-5 key steps.
- Each step should be actionable and include a recommended time interval (e.g., "Day 1: Initial Email," "Day 3: LinkedIn Connection," etc.).
- Respond as a simple list. Do not use Markdown headings.
- The tone should be professional and direct.

Lead Data: ${JSON.stringify(leadData)}
Qualification Report: ${JSON.stringify(reportData)}
`;

            const geminiResponse = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": process.env.FIRST_API_KEY,
                    },
                    body: JSON.stringify({
                        contents: [{
                            role: "user",
                            parts: [{ text: geminiPrompt }],
                        }],
                        generationConfig: {
                            maxOutputTokens: 500,
                            temperature: 0.7,
                        }
                    }),
                }
            );

            const geminiData = await geminiResponse.json();
            console.log("Gemini API raw response for cadence:", JSON.stringify(geminiData, null, 2));
            let cadenceText = "No cadence generated.";

            if (geminiData?.candidates?.length > 0) {
                cadenceText = geminiData.candidates
                    .map(c => c.content?.parts?.map(p => p.text).join("\n"))
                    .join("\n") || cadenceText;
            }

            const cadenceItems = cadenceText.split('\n').filter(item => item.trim() !== '');

            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    cadence: cadenceItems,
                }),
            };
        }

        // --- Handle Lead Qualification Request (original logic) ---
        const { leadData, includeDemographics } = body;

        // ... [Your existing logic for lead-qualifier.js] ...

        const geminiPrompt = `
You are a professional sales analyst. Analyze the following lead data and generate a structured report. Respond in plain text exactly in this format:

### Qualification Report

[Detailed actionable analysis including budget, timeline, company size, industry, lead needs, demographics if requested]

### Predictive Engagement

[Predictive engagement insights based on the lead's profile]

### Suggested Outreach

[Recommended outreach strategies with tone, messaging style, channels]

### Suggested Questions

[5–10 strategic discovery questions]

Lead Data: ${JSON.stringify(leadData)}
Include Demographics: ${includeDemographics}

Respond fully under each heading.
`;

        const geminiResponse = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": process.env.FIRST_API_KEY,
                },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [{ text: geminiPrompt }],
                    }],
                    generationConfig: {
                        maxOutputTokens: 1500,
                        temperature: 0.5,
                    }
                }),
            }
        );

        const geminiData = await geminiResponse.json();
        let reportText = "No report generated.";
        if (geminiData?.candidates?.length > 0) {
            reportText = geminiData.candidates
                .map(c => c.content?.parts?.map(p => p.text).join("\n"))
                .join("\n") || reportText;
        }

        const sections = { report: "", predictive: "", outreach: "", questions: "" };
        const headingRegex = /###\s*(Qualification Report|Predictive Engagement|Suggested Outreach|Suggested Questions)/gi;
        const matches = [...reportText.matchAll(headingRegex)];
        for (let i = 0; i < matches.length; i++) {
            const heading = matches[i][1].toLowerCase().replace(/\s/g, '');
            const start = matches[i].index + matches[i][0].length;
            const end = (i + 1 < matches.length) ? matches[i + 1].index : reportText.length;
            const content = reportText.slice(start, end).trim();
            if (heading.includes("qualification")) sections.report = content;
            else if (heading.includes("predictive")) sections.predictive = content;
            else if (heading.includes("outreach")) sections.outreach = content;
            else if (heading.includes("questions")) sections.questions = content;
        }

        let newsSnippet = "";
        if (process.env.RYGUY_SEARCH_API_KEY && process.env.RYGUY_SEARCH_ENGINE_ID) {
        const query = `"${leadData["lead-company"]}" news headlines`;
            const searchRes = await fetch(
                `https://www.googleapis.com/customsearch/v1?key=${process.env.RYGUY_SEARCH_API_KEY}&cx=${process.env.RYGUY_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=3`
            );
            const searchData = await searchRes.json();
            if (searchData.items?.length) {
                newsSnippet = searchData.items
                    .map(item => `<strong>${item.title}</strong>: ${item.snippet} <a href="${item.link}" target="_blank" class="text-blue-400 underline">Read more</a>`)
                    .join("<br><br>");
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                report: sections.report || "No report generated.",
                predictive: sections.predictive || "Predictive engagement insights go here.",
                outreach: sections.outreach || "Suggested outreach strategies go here.",
                questions: sections.questions || "Strategic discovery questions go here.",
                news: newsSnippet,
            }),
        };

    } catch (error) {
        console.error("Function error:", error.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
