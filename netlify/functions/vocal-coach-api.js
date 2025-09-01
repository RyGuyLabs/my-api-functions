// This code will run on your Netlify serverless function.
// It acts as an intermediary between your client-side HTML and the Gemini API.

const API_KEY = process.env.FIRST_API_KEY; // This should be set in your Netlify environment variables
const API_URL_TEXT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
const API_URL_TTS = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;

// Helper function to convert raw PCM to WAV format
// This is done on the server to prevent the client from needing a complex audio library
function pcmToWav(pcmData) {
  const sampleRate = 24000;
  const pcm16 = new Int16Array(pcmData);
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x46464952, false);
  // file length
  view.setUint32(4, 36 + pcm16.length * 2, true);
  // RIFF type
  view.setUint32(8, 0x45564157, false);
  // format chunk identifier
  view.setUint32(12, 0x20746d66, false);
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate
  view.setUint32(28, sampleRate * 2, true);
  // block align
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x61746164, false);
  // data chunk length
  view.setUint32(40, pcm16.length * 2, true);

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }
  return Buffer.from(buffer).toString('base64');
}

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { base64Audio, mimeType } = JSON.parse(event.body);

    // Define the prompt for Gemini to analyze the tone
    const promptText = `As a professional, motivating, resonating, memorable, insightful, detailed, and thorough vocal coach, analyze the tone, pace, clarity, and confidence of the sales pitch provided in the audio. Your analysis must be reflective of a world-class coach. Provide a score from 0 to 100 based on the overall delivery. The output MUST be a single JSON object with the keys 'score' (number) and 'analysis' (string). The 'analysis' should be a detailed, professional, and actionable summary of the performance. Example: {"score": 85, "analysis": "Your tone was masterful and your clarity was excellent. To make your pitch more memorable, try incorporating a pause before your key value proposition to create emphasis. Continue to practice varying your pace to maintain a resonant and engaging delivery throughout the entire pitch."}`;

    // 1. Call Gemini to get the analysis (score and text)
    const textPayload = {
      contents: [{
        role: "user",
        parts: [{
          text: promptText
        }, {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      },
    };

    const textResponse = await fetch(API_URL_TEXT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(textPayload)
    });

    const textResult = await textResponse.json();
    const analysisText = textResult?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysisText) {
      throw new Error("Failed to get analysis from Gemini.");
    }

    const { score, analysis } = JSON.parse(analysisText);

    // 2. Call Gemini TTS to get the audio feedback
    const ttsPayload = {
      contents: [{
        parts: [{
          text: `Your score is ${score} percent. ${analysis}`
        }]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Rasalgethi"
            }
          }
        }
      },
    };

    const ttsResponse = await fetch(API_URL_TTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsPayload)
    });

    const ttsResult = await ttsResponse.json();
    const ttsPart = ttsResult?.candidates?.[0]?.content?.parts?.[0];

    if (!ttsPart || !ttsPart.inlineData || !ttsPart.inlineData.data) {
      throw new Error("Failed to get audio feedback from Gemini TTS.");
    }

    const audioData = ttsPart.inlineData.data;

    // Convert the raw audio data (PCM) to a WAV file format
    const audioBuffer = base64ToArrayBuffer(audioData);
    const wavBase64 = pcmToWav(audioBuffer);

    // Return both the analysis and the base64 audio data
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        score,
        analysis,
        audioData: wavBase64,
        mimeType: "audio/wav"
      })
    };

  } catch (error) {
    console.error("Error in serverless function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: error.message || "Internal Server Error"
      })
    };
  }
};
