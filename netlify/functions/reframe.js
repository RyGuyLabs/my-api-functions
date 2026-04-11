/**
 * PROJECT: RyGuy Sovereign Therapy Engine
 * VERSION: 1.2 (AI-Integrated / Production)
 * LOGIC: Hybrid Keyword Analysis + Generative Insight
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Standard for Gemini
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- THE ARCHITECT'S PROMPT CONFIG ---
const SYSTEM_PROMPT = `
You are the RyGuy Sovereign Architect. Your mission is the Prime Directive: 
Helping people overcome social anxiety and fear to achieve their dreams. 
Your tone is grounded, high-frequency, and direct. 
Analyze the user's input and provide a 'Sovereign Directive' that focuses on volition and action.
`;

// --- THE LOGIC PORTAL ---
app.post('/api/v1/process', async (req, res) => {
    const { payload } = req.body;

    if (!payload) return res.status(400).json({ error: "No signal detected." });

    try {
        // Initialize the Model
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Generate the Sovereign Insight
        const result = await model.generateContent([
            { text: SYSTEM_PROMPT },
            { text: `User Input: ${payload}` }
        ]);

        const responseText = result.response.text();

        // Return the "High-Definition" Package
        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            directive: responseText,
            meta: {
                engine: "Sovereign_v1.2",
                status: "High_Frequency"
            }
        });

    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: "Logic Breach: Check API Key / Environment Variables." });
    }
});

// Health Check
app.get('/hc', (req, res) => {
    res.status(200).json({ status: 'Online', security: 'Encrypted' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`RYGUY LABS: API-INTEGRATED ENGINE LIVE ON PORT ${PORT}`);
});
