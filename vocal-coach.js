// Global state variables
let audioStream;
let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let visualizerAnimationFrame;
let prescribedText = "Confidence is a journey, not a destination. With every step you take, your voice grows stronger. Speak your truth with clarity and conviction, and remember that your message holds immense value.";

// DOM element references
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const generateTextBtn = document.getElementById('generate-text-btn');
const prescribedTextElement = document.getElementById('prescribed-text');
const audioPlayback = document.getElementById('audio-playback');
const visualizerCanvas = document.getElementById('visualizer');
const analysisContent = document.getElementById('analysis-content');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');

// Helper function to set UI state
const setUIState = (state) => {
    switch (state) {
        case 'idle':
            startBtn.disabled = false;
            stopBtn.disabled = true;
            generateTextBtn.disabled = false;
            break;
        case 'recording':
            startBtn.disabled = true;
            stopBtn.disabled = false;
            generateTextBtn.disabled = true;
            showMessageBox('Recording...', 'info');
            break;
        case 'analyzing':
            startBtn.disabled = true;
            stopBtn.disabled = true;
            generateTextBtn.disabled = true;
            analysisContent.innerHTML = `<p class="text-gray-400">Analyzing your recording...</p>`;
            showMessageBox('Analyzing...', 'info');
            break;
        case 'generating-text':
            startBtn.disabled = true;
            stopBtn.disabled = true;
            generateTextBtn.disabled = true;
            showMessageBox('Generating new text...', 'info');
            break;
        case 'feedback':
            startBtn.disabled = false;
            stopBtn.disabled = true;
            generateTextBtn.disabled = false;
            break;
    }
};

// Helper function to show a message box
const showMessageBox = (message, type) => {
    messageText.textContent = message;
    messageBox.className = `p-4 mt-4 rounded-lg text-white ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`;
    messageBox.style.display = 'block';
};

// Helper function to convert Blob to Base64
const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Helper function to render feedback to the UI
const renderFeedback = (feedback) => {
    if (feedback.error) {
        analysisContent.innerHTML = `<p class="text-red-400">Error: ${feedback.error}</p>`;
        return;
    }

    let html = `<div class="p-4 rounded-lg bg-gray-800 shadow-md">
                    <p class="mb-4 text-gray-300 font-bold text-center">${feedback.summary}</p>
                    <div class="grid grid-cols-2 gap-4 text-center mb-6">
                        <div class="p-4 bg-gray-900 rounded-lg">
                            <h4 class="font-semibold text-lg text-purple-400">Confidence Score</h4>
                            <p class="text-3xl font-bold text-purple-400">${feedback.score.confidence}</p>
                        </div>
                        <div class="p-4 bg-gray-900 rounded-lg">
                            <h4 class="font-semibold text-lg text-teal-400">Clarity Score</h4>
                            <p class="text-3xl font-bold text-teal-400">${feedback.score.clarity}</p>
                        </div>
                    </div>
                    <div class="mb-6">
                        <h4 class="text-purple-400 font-bold text-lg mb-2">Strengths</h4>
                        <ul class="list-disc list-inside text-gray-400 space-y-1">
                            ${feedback.strengths.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="mb-6">
                        <h4 class="text-teal-400 font-bold text-lg mb-2">Areas for Improvement</h4>
                        <ul class="list-disc list-inside text-gray-400 space-y-1">
                            ${feedback.improvements.map(i => `<li>${i}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="text-center font-bold text-lg text-gray-300 italic">
                        <p>"${feedback.nextSteps}"</p>
                    </div>
                </div>`;
    analysisContent.innerHTML = html;
};

// Exponential backoff utility for retrying API calls.
const withExponentialBackoff = async (func, maxRetries = 5, delay = 1000) => {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await func();
        } catch (error) {
            if (i === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
};
    
// Makes a direct API call to the Netlify function.
const callNetlifyFunction = async (payload) => {
    return withExponentialBackoff(async () => {
        const response = await fetch('https://www.ryguylabs.com/.netlify/functions/api-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.message || response.statusText;
            throw new Error(`API error: ${response.status} - ${errorMessage}`);
        }

        return await response.json();
    });
};
    
// Handles the start recording action.
const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setUIState('recording');
        audioStream = stream;
        audioChunks = [];
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioPlayback.src = URL.createObjectURL(audioBlob);
            processRecording(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        setupVisualizer(stream);
        drawVisualizer();
    } catch (error) {
        console.error("Failed to get microphone access:", error);
        showMessageBox('Microphone access denied. Please enable it in your browser settings.', 'error');
        setUIState('idle');
    }
};
    
// Handles the stop recording action.
const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if (visualizerAnimationFrame) {
            cancelAnimationFrame(visualizerAnimationFrame);
        }
    }
};
    
// Sets up the audio visualizer.
const setupVisualizer = (stream) => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (analyser) {
        analyser.disconnect();
    }
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const canvasCtx = visualizerCanvas.getContext('2d');
    const draw = () => {
        visualizerAnimationFrame = requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        canvasCtx.fillStyle = '#1f2937';
        canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        
        const barWidth = (visualizerCanvas.width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 2;
            
            const r = barHeight + (25 * (i / bufferLength));
            const g = 250 * (i / bufferLength);
            const b = 50;
            
            canvasCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            canvasCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    };
    
    drawVisualizer = draw;
};
    
// A placeholder function to be replaced by the `setupVisualizer` drawing function.
let drawVisualizer = () => {};

    
// Processes the recorded audio and sends it to the LLM for analysis.
const processRecording = async (audioBlob) => {
    try {
        setUIState('analyzing');

        const base64Audio = await blobToBase64(audioBlob);
            
        // The URL is now the Netlify function endpoint.
        const payload = {
            feature: "vocal_coach",
            audio: base64Audio,
            prompt: `You are a professional vocal coach. I've recorded myself saying the following text: "${prescribedText}".
Your goal is to provide concise, structured, and encouraging feedback.

Please analyze the user's tone based on the goals of being confident, calm, and persuasive.

Format your response as a JSON object with the following keys and structure. Your scores should be between 1 and 100.
{
    "summary": "A 1-2 sentence summary of the overall performance.",
    "score": {
    "confidence": 85,
    "clarity": 90
    },
    "strengths": [ "Bullet point 1 highlighting a strength", "Bullet point 2 highlighting a strength" ],
    "improvements": [ "Bullet point 1 for improvement", "Bullet point 2 for improvement" ],
    "nextSteps": "A single encouraging sentence or phrase."
}`,
            mimeType: "audio/webm",
        };

        const feedback = await callNetlifyFunction(payload);
            
        if (feedback && feedback.summary) {
            renderFeedback(feedback);
            setUIState('feedback');
            showMessageBox('Analysis complete!', 'success');
        } else {
            throw new Error("Could not get a valid response from the API.");
        }

    } catch (error) {
        console.error("Failed to get LLM response:", error);
        analysisContent.innerHTML = `<p class="text-red-400">An error occurred while analyzing your recording: ${error.message}. Please try again.</p>`;
        setUIState('feedback');
        showMessageBox('Analysis failed.', 'error');
    }
};

/**
 * Generates a new practice text using the Gemini API.
 */
const generateNewText = async () => {
    setUIState('generating-text');
    try {
        const textPrompt = "Please write a concise, one-paragraph text (around 30-40 words) for a professional to read. The text should be suitable for a sales pitch, job interview, or a professional presentation, and should be designed to be read with a confident, calm, and persuasive tone.";
            
        // The URL is now the Netlify function endpoint.
        const payload = {
            feature: "generate_text",
            prompt: textPrompt,
        };

        const result = await callNetlifyFunction(payload);
            
        // The Netlify function returns an object with a 'text' property.
        if (result && result.text) {
            prescribedText = result.text.trim().replace(/^"|"$/g, '');
            prescribedTextElement.textContent = prescribedText;
            setUIState('idle');
            showMessageBox('New text generated!', 'success');
        } else {
            throw new Error("Could not get a valid response from the API.");
        }
    } catch (error) {
        console.error("Failed to generate new text:", error);
        prescribedTextElement.textContent = "Failed to generate new text. Please try again or use the default text.";
        setUIState('idle');
        showMessageBox('Failed to generate text.', 'error');
    }
};

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
generateTextBtn.addEventListener('click', generateNewText);
    
// Initial state
setUIState('idle');
