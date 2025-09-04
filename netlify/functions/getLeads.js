import fs from "fs";
import path from "path";

export async function handler(event, context) {
  try {
    // Path to leads.json
    const filePath = path.join(process.cwd(), "functions", "leads.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const leads = JSON.parse(fileData);

    return {
      statusCode: 200,
      body: JSON.stringify({ leads }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
