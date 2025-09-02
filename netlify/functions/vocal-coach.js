const responseTextRaw = await result.response.text();
      const responseText = responseTextRaw.trim();

      // Helper function to extract JSON block from AI response
      function extractJson(text) {
        const jsonMatch = text.match(/```json([\s\S]*?)```/i)
          || text.match(/```([\s\S]*?)```/)
          || [null, text];
        return jsonMatch[1] ? jsonMatch[1].trim() : text.trim();
      }

      try {
        const jsonText = extractJson(responseText);
        const feedback = JSON.parse(jsonText);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(feedback),
        };
      } catch (jsonError) {
        console.error("Failed to parse AI model response:", jsonError);
        console.log("Raw model output:", responseText);

        // Fallback: Return raw text as summary in a JSON wrapper
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            summary: responseText, // so frontend can display it safely
            error: "Response was not valid JSON, showing raw text instead."
          }),
        };
      }
    }

    // ❌ Unknown Action
    else {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid action specified." }),
      };
    }

  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "An unexpected error occurred." }),
    };
  }
};
