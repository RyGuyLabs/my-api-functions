exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers };
    }

    const requestId = Math.random().toString(36).substring(2, 10);
    const startTime = Date.now();

    try {
        if (!event.body) throw new Error("Missing request body");

        const data = JSON.parse(event.body);
        const { phase, promptLabel, input, timestamp } = data;

        // =====================
        // VALIDATION
        // =====================
        if (!phase || !promptLabel || !input) {
            throw new Error("Missing required fields: phase, promptLabel, or input");
        }

        if (input.length < 2) {
            throw new Error("Input too short. Minimum 2 characters required.");
        }

        // =====================
        // SANITIZATION
        // =====================
        const sanitize = (str) =>
            String(str || "").replace(/[<>]/g, "").trim().slice(0, 300);

        const safePayload = {
            phase: sanitize(phase),
            promptLabel: sanitize(promptLabel),
            input: sanitize(input),
            timestamp: timestamp || Date.now()
        };

        // =====================
        // PERSISTENCE LOGIC
        // =====================
        // Placeholder for production storage: database, Google Sheets, or file system.
        // Example: await saveToDatabase(safePayload);
        // For demo, we just echo back payload.

        const response = {
            status: "success",
            message: "Extraction committed successfully.",
            data: safePayload,
            meta: {
                requestId,
                serverTimeMs: Date.now() - startTime
            }
        };

        return { statusCode: 200, headers, body: JSON.stringify(response) };

    } catch (err) {
        console.error(`[${requestId}] Error:`, err.message);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                status: "error",
                message: err.message,
                requestId
            })
        };
    }
};
