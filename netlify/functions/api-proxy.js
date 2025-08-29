import { GoogleGenerativeAI } from "@google/generative-ai";

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, userGoal } = body;

        // Validation checks
        if (!feature || !userGoal) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Missing "feature" or "userGoal" in request body.' })
            };
        }

        const geminiApiKey = process.env.FIRST_API_KEY;
        if (!geminiApiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'Missing API Key.' })
            };
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        let apiResponse = null;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        switch (feature) {
            case "positive_spin":
                apiResponse = await model.generateContent(`You are a motivational coach named RyGuy. Your task is to transform a negative thought or situation into a positive and actionable mindset for a sales professional. Your response must be:
1. Short and punchy.
2. Directly address the negative thought.
3. Provide a single, concrete action or reframe.
4. Do not use bullet points or lists.
5. Example: If the user says "I failed to hit my quota this month," you would respond "This isn't a failure, it's a data point. What can you learn from this month to crush it next month? Analyze your process, not your result."
User's negative thought: "${userGoal}"`);
                break;
            case "mindset_reset":
                apiResponse = await model.generateContent(`You are a motivational coach named RyGuy. A sales professional feels stuck and needs actionable advice to shift their energy. The response should be a list of 3-5 concrete, simple steps they can take right now. The tone should be direct and motivating. Use a markdown list.
Example: If the user says "I can't seem to make progress on this project," you would respond with a markdown list like:
* **Take a 15-minute break:** Step away from the screen. Walk, stretch, or just grab some water. Reset your focus.
* **Break it down:** This project is too big. Identify the single, smallest task you can complete in the next 10 minutes and do only that.
* **Change your environment:** Move to a new location. A fresh perspective can lead to fresh ideas.
User's feeling: "${userGoal}"`);
                break;
            case "objection_handler":
                apiResponse = await model.generateContent(`You are a sales coach named RyGuy. Provide three distinct, actionable response strategies to a common sales objection. The tone should be confident and helpful. Format the response as a markdown list with clear headings for each strategy.
Example: If the user says "I don't have time to talk right now," you would respond with a markdown list like:
* **Strategy 1: Empathy and a Quick Pivot.** Acknowledge their time is valuable and offer to schedule.
* **Strategy 2: The '30-Second Summary'.** Respect their time and give them a very concise, high-value reason to stay on the call.
* **Strategy 3: The 'Pattern Interrupt'.** Say something unexpected but relevant to grab their attention and re-engage them.
User's objection: "${userGoal}"`);
                break;
            case "plan":
                apiResponse = await model.generateContent(`Create a highly actionable, detailed, and motivating step-by-step plan for the user's dream. Be specific and break it down into manageable tasks. Format the plan using clear headers and bullet points. The user's dream is: ${userGoal}`);
                break;
            case "pep_talk":
                apiResponse = await model.generateContent(`Write an extremely short, high-energy, and highly motivating pep talk for the user about their dream. It should be punchy and encouraging. The user's dream is: ${userGoal}`);
                break;
            case "vision_prompt":
                apiResponse = await model.generateContent(`Write a creative and vivid prompt for a vision board that will help the user visualize their dream. Focus on sensory details and strong imagery. The user's dream is: ${userGoal}`);
                break;
            case "obstacle_analysis":
                apiResponse = await model.generateContent(`Provide a list of potential obstacles the user might encounter while pursuing their dream, and provide a single, concise strategy for overcoming each one. The user's dream is: ${userGoal}`);
                break;
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Invalid "feature" specified.' })
                };
        }
        
        // This is the CRUCIAL change.
        if (apiResponse && apiResponse.text) {
            const textResponse = apiResponse.text();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ response: textResponse })
            };
        } else {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: "An unexpected error occurred or the response was empty." })
            };
        }

    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
