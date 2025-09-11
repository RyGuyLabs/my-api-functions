// File: netlify/functions/lead-qualifier.js
import fetch from 'node-fetch'; // Only needed if Node <18, optional in Node 18+
import { google } from '@googleapis/generative'; // Assuming you are using Google Gemini

export async function handler(event, context) {
    try {
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method Not Allowed' }),
            };
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid JSON payload' }),
            };
        }

        const { leadData, criteria, includeDemographics } = body;

        if (!leadData || Object.keys(leadData).length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No lead data provided' }),
            };
        }

        // ----------------------
        // Step 1: Generate qualification report
        // ----------------------
        let report = '';
        let score = 0;
        let category = 'Unqualified';

        try {
            // Example logic for scoring; you can adjust to your C.A.L.L. criteria
            score = 50; // default mid score
            if (leadData['lead-budget'] && parseInt(leadData['lead-budget'].replace(/\D/g, '')) > 50000) {
                score += 30;
            }
            if (leadData['lead-timeline'] && leadData['lead-timeline'].toLowerCase().includes('immediate')) {
                score += 20;
            }

            if (score >= 80) category = 'Hot';
            else if (score >= 50) category = 'Warm';
            else category = 'Cold';

            report = `Lead scored ${score}/100. Category: ${category}.`;
        } catch (err) {
            console.error('Error generating report:', err);
            report = 'Unable to generate report due to internal error.';
        }

        // ----------------------
        // Step 2: Fetch news snippet (Safe fetch)
        // ----------------------
        let newsSnippet = '';
        if (leadData['lead-company']) {
            const newsUrl = `https://api.example.com/news?company=${encodeURIComponent(leadData['lead-company'])}`;
            try {
                const newsResponse = await fetch(newsUrl);
                if (!newsResponse.ok) {
                    console.warn(`News fetch failed with status ${newsResponse.status}`);
                    newsSnippet = 'Unable to fetch news.';
                } else {
                    newsSnippet = await newsResponse.text();
                }
            } catch (err) {
                console.error('Error fetching news snippet:', err);
                newsSnippet = 'Unable to fetch news at this time.';
            }
        }

        // ----------------------
        // Step 3: Generate predictive insights, outreach, and discovery questions
        // ----------------------
        let predictiveInsight = '';
        let outreachMessage = '';
        let discoveryQuestions = '';

        try {
            // Placeholder logic for AI generation (replace with real Gemini API call)
            predictiveInsight = `Based on the lead data, ${leadData['lead-name']} may require additional CRM support.`;
            outreachMessage = `Hi ${leadData['lead-name']},\n\nI noticed your company ${leadData['lead-company']} is looking for CRM solutions. I’d love to help streamline your workflow.`;
            discoveryQuestions = '- What is your current CRM system?\n- What pain points are you facing?\n- What is your timeline for implementation?';
        } catch (err) {
            console.error('Error generating AI content:', err);
        }

        // ----------------------
        // Step 4: Build response
        // ----------------------
        const responseBody = {
            report,
            score,
            category,
            news: newsSnippet,
            predictiveInsight,
            outreachMessage,
            discoveryQuestions,
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Required for CORS
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify(responseBody),
        };
    } catch (err) {
        console.error('Unexpected server error:', err);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Unexpected server error' }),
        };
    }
}
