<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RyGuy Mindset Motivator</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        /* Global styles and font family */
        html, body {
            margin: 0;
            padding: 0;
            overflow-x: hidden;
            font-family: 'Inter', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* The full-screen animated background effect */
        .animated-background {
            background: linear-gradient(-45deg, #0f172a, #1e3a8a, #4f46e5, #4338ca);
            background-size: 400% 400%;
            animation: gradient-animation 15s ease infinite;
        }

        @keyframes gradient-animation {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        /* Custom spinner animation */
        .animate-spin {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        /* Style for the confirmation message */
        .confirmation-message {
            transition: all 0.3s ease-out;
            opacity: 0;
            transform: translateY(20px);
        }
        .confirmation-message.show {
            opacity: 1;
            transform: translateY(0);
        }
        /* Fade transition for quotes */
        .fade-in {
            animation: fadeIn 1s ease-in-out forwards;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Custom styles for the Markdown output to look good with Tailwind's prose */
        #mindset-response.prose li::marker {
            color: #10B981; /* Tailwind's emerald-500 */
            font-weight: bold;
        }
        #objection-response.prose li::marker {
            color: #FACC15; /* Tailwind's yellow-400 */
            font-weight: bold;
        }
    </style>
</head>
<body class="text-gray-200 p-4 sm:p-8 flex flex-col items-center min-h-screen relative">
    <div class="fixed inset-0 -z-10 animated-background"></div>
    
    <div class="relative z-10 w-full flex flex-col items-center">
        <div class="w-full max-w-6xl text-center my-8">
            <div class="relative overflow-hidden h-16">
                <p id="quote-reel" class="text-xl sm:text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 absolute w-full top-0 left-0 transition-opacity duration-1000">
                    "Your energy is your greatest sales asset."
                </p>
            </div>
        </div>
    
        <div class="max-w-xl w-full flex flex-col items-center space-y-8">
            <div class="bg-gray-900/50 rounded-2xl shadow-2xl p-8 border border-gray-800 backdrop-blur-sm w-full">
                <div class="flex flex-col items-center text-center mb-8">
                    <h2 class="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 mb-2">
                        Positive Spin from RyGuy
                    </h2>
                    <p class="text-gray-400 text-lg max-w-prose">
                        Turn a negative thought into a positive mindset.
                    </p>
                </div>
    
                <form id="reframer-form" class="flex flex-col gap-4 mb-8">
                    <label for="negative-input" class="sr-only">Enter your negative thought or situation</label>
                    <textarea
                        id="negative-input"
                        rows="4"
                        placeholder="e.g., 'I failed to hit my quota this month.'"
                        class="w-full p-4 bg-gray-800/50 text-gray-200 rounded-xl border border-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all duration-300 resize-none flex-grow"
                    ></textarea>
                    <button
                        id="reframer-btn"
                        type="submit"
                        class="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 transform active:scale-95 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        <span id="reframer-icon-sparkle"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles"><path d="M10.9 2.1c.4-.6.9-1.2 1.5-1.7.2-.2.4-.4.5-.5.1-.1.2-.1.3-.2.3-.1.6-.2.9-.2H21c-1 2.3-3.6 5.8-5.2 7.7-.6.7-1.1 1.4-1.6 2.1.2-.2.5-.4.7-.6.9-1.1 1.6-2.5 2.1-4.1.2-.6.4-1.2.6-1.8.1-.2.2-.4.3-.6L12 2.1zM14.9 21.9c-.4.6-.9 1.2-1.5 1.7-.2.2-.4.4-.5.5-.1.1-.2.1-.3.2-.3.1-.6.2-.9.2H3c1-2.3 3.6-5.8 5.2-7.7.6-.7 1.1-1.4 1.6-2.1-.2.2-.5.4-.7.6-.9 1.1-1.6 2.5-2.1 4.1-.2.6-.4 1.2-.6 1.8-.1.2-.2.4-.3.6L12 21.9zM2 13c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" /></svg></span>
                        <span id="reframer-icon-spinner" class="hidden lucide lucide-loader-2 animate-spin"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg></span>
                        <span id="reframer-button-text">Get a Positive Spin</span>
                    </button>
                </form>
    
                <div id="reframer-error-container" class="hidden mt-4 p-4 bg-red-900/50 text-red-300 rounded-xl border border-red-800">
                    <p id="reframer-error-message" class="font-medium"></p>
                </div>
    
                <div id="reframer-results" class="hidden mt-4 p-6 bg-gray-800/50 rounded-2xl border border-gray-700 shadow-inner space-y-4">
                    <h3 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle"><path d="M7.9 20A9.4 9.4 0 0 1 12 18a9.4 9.4 0 0 1 4.1 2A2 2 0 0 0 18 20h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2a2 2 0 0 0 1.9-2z" /></svg>
                        RyGuy's Positive Spin
                    </h3>
                    <p id="reframer-response" class="text-lg text-gray-300 leading-relaxed whitespace-pre-wrap"></p>
                    <button
                        id="copy-reframer-btn"
                        class="w-full py-2 px-4 rounded-lg bg-gray-700/50 text-sm text-gray-200 font-medium hover:bg-gray-600/50 transition-all transform active:scale-95"
                    >
                        Copy Response
                    </button>
                </div>
            </div>
            
            <div class="bg-gray-900/50 rounded-2xl shadow-2xl p-8 border border-gray-800 backdrop-blur-sm w-full">
                <div class="flex flex-col items-center text-center mb-8">
                    <h2 class="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 mb-2">
                        RyGuy Mindset Reset
                    </h2>
                    <p class="text-gray-400 text-lg max-w-prose">
                        Feeling stuck? Get actionable advice to shift your energy.
                    </p>
                </div>
    
                <form id="mindset-form" class="flex flex-col gap-4 mb-8">
                    <div class="flex flex-col gap-2">
                        <label for="stuck-input" class="sr-only">Describe why you're feeling stuck</label>
                        <textarea
                            id="stuck-input"
                            rows="4"
                            placeholder="e.g., 'I can't seem to make progress on this project.'"
                            class="w-full p-4 bg-gray-800/50 text-gray-200 rounded-xl border border-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 resize-none"
                        ></textarea>
                    </div>
                    <button
                        id="mindset-btn"
                        type="submit"
                        class="w-full flex items-center justify-center gap-2 px-6 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 transform active:scale-95 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        <span id="mindset-icon-sparkle"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles"><path d="M10.9 2.1c.4-.6.9-1.2 1.5-1.7.2-.2.4-.4.5-.5.1-.1.2-.1.3-.2.3-.1.6-.2.9-.2H21c-1 2.3-3.6 5.8-5.2 7.7-.6.7-1.1 1.4-1.6 2.1.2-.2.5-.4.7-.6.9-1.1 1.6-2.5 2.1-4.1.2-.6.4-1.2.6-1.8.1-.2.2-.4.3-.6L12 2.1zM14.9 21.9c-.4.6-.9 1.2-1.5 1.7-.2.2-.4.4-.5.5-.1.1-.2.1-.3.2-.3.1-.6.2-.9.2H3c1-2.3 3.6-5.8 5.2-7.7.6-.7 1.1-1.4 1.6-2.1-.2.2-.5.4-.7.6-.9 1.1-1.6 2.5-2.1 4.1-.2.6-.4 1.2-.6 1.8-.1.2-.2.4-.3.6L12 21.9zM2 13c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" /></svg></span>
                        <span id="mindset-icon-spinner" class="hidden lucide lucide-loader-2 animate-spin"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg></span>
                        <span id="mindset-button-text">Reset My Mindset</span>
                    </button>
                </form>
    
                <div id="mindset-error-container" class="hidden mt-4 p-4 bg-red-900/50 text-red-300 rounded-xl border border-red-800">
                    <p id="mindset-error-message" class="font-medium"></p>
                </div>
    
                <div id="mindset-results" class="hidden mt-4 p-6 bg-gray-800/50 rounded-2xl border border-gray-700 shadow-inner space-y-4">
                    <h3 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rocket"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.75-1.065 1.5-4.8 1.5-4.8-1.12 2.5-1.98 4.67-2.75 6.46C8.8 21.94 10.3 23 12 23c1.7 0 3.2-1.06 3.95-2.54-.77-1.79-1.63-3.96-2.75-6.46 0 0 .75-3.735 1.5-4.8 1.26-1.5 5-2 5-2s-1.26 3.74-2 5c-1.065.75-4.8 1.5-4.8 1.5s-2.5 1.12-4.67 1.98-3.96 1.63-6.46 2.75-4.8 1.5-4.8 1.5z" /></svg>
                        RyGuy's Mindset Reset
                    </h3>
                    <div id="mindset-response" class="prose prose-sm prose-invert max-w-none text-gray-200"></div>
                    <div class="flex gap-2">
                            <button
                                id="copy-mindset-btn"
                                class="flex-1 py-2 px-4 rounded-lg bg-gray-700/50 text-sm text-gray-200 font-medium hover:bg-gray-600/50 transition-all transform active:scale-95"
                            >
                                Copy Response
                            </button>
                    </div>
                </div>
            </div>

            <div class="bg-gray-900/50 rounded-2xl shadow-2xl p-8 border border-gray-800 backdrop-blur-sm w-full">
                <div class="flex flex-col items-center text-center mb-8">
                    <h2 class="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 mb-2">
                        RyGuy Objection Handler
                    </h2>
                    <p class="text-gray-400 text-lg max-w-prose">
                        Have RyGuy help you with actionable responses to common sales questions.
                    </p>
                </div>
    
                <form id="objection-form" class="flex flex-col gap-4 mb-8">
                    <label for="objection-input" class="sr-only">Enter a sales objection</label>
                    <textarea
                        id="objection-input"
                        rows="4"
                        placeholder="e.g., 'I don't have time to talk right now,' or 'Your price is too high.'"
                        class="w-full p-4 bg-gray-800/50 text-gray-200 rounded-xl border border-gray-700 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all duration-300 resize-none"
                    ></textarea>
                    <button
                        id="objection-btn"
                        type="submit"
                        class="w-full flex items-center justify-center gap-2 px-6 py-4 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-xl shadow-lg transition-all duration-300 transform active:scale-95 disabled:bg-gray-600 disabled:text-gray-200 disabled:cursor-not-allowed"
                    >
                        <span id="objection-icon-sparkle"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles"><path d="M10.9 2.1c.4-.6.9-1.2 1.5-1.7.2-.2.4-.4.5-.5.1-.1.2-.1.3-.2.3-.1.6-.2.9-.2H21c-1 2.3-3.6 5.8-5.2 7.7-.6.7-1.1 1.4-1.6 2.1.2-.2.5-.4.7-.6.9-1.1 1.6-2.5 2.1-4.1.2-.6.4-1.2.6-1.8.1-.2.2-.4.3-.6L12 2.1zM14.9 21.9c-.4.6-.9 1.2-1.5 1.7-.2.2-.4.4-.5.5-.1.1-.2.1-.3.2-.3.1-.6.2-.9.2H3c1-2.3 3.6-5.8 5.2-7.7.6-.7 1.1-1.4 1.6-2.1-.2.2-.5.4-.7.6-.9 1.1-1.6 2.5-2.1 4.1-.2.6-.4 1.2-.6 1.8-.1.2-.2.4-.3.6L12 21.9zM2 13c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" /></svg></span>
                        <span id="objection-icon-spinner" class="hidden lucide lucide-loader-2 animate-spin"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg></span>
                        <span id="objection-button-text">Get Responses</span>
                    </button>
                </form>
    
                <div id="objection-error-container" class="hidden mt-4 p-4 bg-red-900/50 text-red-300 rounded-xl border border-red-800">
                    <p id="objection-error-message" class="font-medium"></p>
                </div>
    
                <div id="objection-results" class="hidden mt-4 p-6 bg-gray-800/50 rounded-2xl border border-gray-700 shadow-inner space-y-4">
                    <h3 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square"><path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2v4l4-4h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><path d="M19 15h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-5.5"/></svg>
                        RyGuy's Response Strategies
                    </h3>
                    <div id="objection-response" class="prose prose-sm prose-invert max-w-none text-gray-200"></div>
                    <button
                        id="copy-objection-btn"
                        class="w-full py-2 px-4 rounded-lg bg-gray-700/50 text-sm text-gray-200 font-medium hover:bg-gray-600/50 transition-all transform active:scale-95"
                    >
                        Copy Responses
                    </button>
                </div>
            </div>
            
            <div id="confirmation-toast" class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full shadow-lg transition-all duration-300 confirmation-message z-20">
                Copied to clipboard!
            </div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            // DOM Elements
            const quoteReel = document.getElementById('quote-reel');
            const reframerForm = document.getElementById('reframer-form');
            const negativeInput = document.getElementById('negative-input');
            const reframerBtn = document.getElementById('reframer-btn');
            const reframerBtnText = document.getElementById('reframer-button-text');
            const reframerIconSparkle = document.getElementById('reframer-icon-sparkle');
            const reframerIconSpinner = document.getElementById('reframer-icon-spinner');
            const reframerErrorContainer = document.getElementById('reframer-error-container');
            const reframerErrorMessage = document.getElementById('reframer-error-message');
            const reframerResults = document.getElementById('reframer-results');
            const reframerResponse = document.getElementById('reframer-response');
            const copyReframerBtn = document.getElementById('copy-reframer-btn');

            const mindsetForm = document.getElementById('mindset-form');
            const stuckInput = document.getElementById('stuck-input');
            const mindsetBtn = document.getElementById('mindset-btn');
            const mindsetBtnText = document.getElementById('mindset-button-text');
            const mindsetIconSparkle = document.getElementById('mindset-icon-sparkle');
            const mindsetIconSpinner = document.getElementById('mindset-icon-spinner');
            const mindsetErrorContainer = document.getElementById('mindset-error-container');
            const mindsetErrorMessage = document.getElementById('mindset-error-message');
            const mindsetResults = document.getElementById('mindset-results');
            const mindsetResponse = document.getElementById('mindset-response');
            const copyMindsetBtn = document.getElementById('copy-mindset-btn');

            const objectionForm = document.getElementById('objection-form');
            const objectionInput = document.getElementById('objection-input');
            const objectionBtn = document.getElementById('objection-btn');
            const objectionBtnText = document.getElementById('objection-button-text');
            const objectionIconSparkle = document.getElementById('objection-icon-sparkle');
            const objectionIconSpinner = document.getElementById('objection-icon-spinner');
            const objectionErrorContainer = document.getElementById('objection-error-container');
            const objectionErrorMessage = document.getElementById('objection-error-message');
            const objectionResults = document.getElementById('objection-results');
            const objectionResponse = document.getElementById('objection-response');
            const copyObjectionBtn = document.getElementById('copy-objection-btn');

            const confirmationToast = document.getElementById('confirmation-toast');
            
            // Quotes for the reel
            const quotes = [
                "Your energy is your greatest sales asset.",
                "Every 'no' is just practice for the next 'yes.'",
                "Mindset over matter. Your thoughts control your results.",
                "The only way to fail is to stop trying. Keep moving forward.",
                "Discipline is the bridge between goals and accomplishment.",
                "Turn a setback into a comeback. The best is yet to come."
            ];
            let currentQuoteIndex = 0;

            // --- Utility Functions ---

            // Sets the loading state for a button
            function setLoadingState(button, isLoading, text, iconSparkle, iconSpinner) {
                button.disabled = isLoading;
                if (isLoading) {
                    text.textContent = 'Loading...';
                    iconSparkle.classList.add('hidden');
                    iconSpinner.classList.remove('hidden');
                } else {
                    text.textContent = text.dataset.originalText;
                    iconSparkle.classList.remove('hidden');
                    iconSpinner.classList.add('hidden');
                }
            }
            
            // Shows a temporary message toast
            function showConfirmation(message) {
                confirmationToast.textContent = message;
                confirmationToast.classList.add('show');
                setTimeout(() => {
                    confirmationToast.classList.remove('show');
                }, 2000);
            }
            
            // Copies text to the clipboard.
            function copyToClipboard(textToCopy) {
                const tempTextArea = document.createElement('textarea');
                tempTextArea.value = textToCopy;
                document.body.appendChild(tempTextArea);
                tempTextArea.select();
                try {
                    document.execCommand('copy');
                    showConfirmation('Copied to clipboard!');
                } catch (err) {
                    console.error('Failed to copy text:', err);
                }
                document.body.removeChild(tempTextArea);
            }

            // --- Quote Reel Logic ---
            function cycleQuotes() {
                // Fade out the current quote
                quoteReel.style.opacity = '0';
                
                setTimeout(() => {
                    // Update the text and reset animation
                    currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
                    quoteReel.textContent = quotes[currentQuoteIndex];
                    quoteReel.classList.remove('fade-in');
                    void quoteReel.offsetWidth; // Trigger reflow to restart animation
                    quoteReel.classList.add('fade-in');
                }, 1000); // Wait for the fade out to complete before changing text
            }
            setInterval(cycleQuotes, 5000); // Change quote every 5 seconds

            // --- API Call Functions ---
            
            async function fetchWithRetry(apiUrl, payload, retries = 0) {
                const maxRetries = 3;
                const initialDelay = 500;
                try {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        return await response.json();
                    }

                    if (retries < maxRetries) {
                        const delay = initialDelay * Math.pow(2, retries) + (Math.random() * 1000);
                        await new Promise(res => setTimeout(res, delay));
                        return fetchWithRetry(apiUrl, payload, retries + 1);
                    }

                    throw new Error(`API call failed with status: ${response.status}`);
                } catch (error) {
                    throw error;
                }
            }
            
            // Function to handle the API call for positive reframing.
            async function handleReframer(e) {
                e.preventDefault(); 
                const negativeThought = negativeInput.value.trim();
                if (!negativeThought) {
                    reframerErrorContainer.classList.remove('hidden');
                    reframerErrorMessage.textContent = "Please enter a thought or situation to reframe.";
                    return;
                }

                reframerErrorContainer.classList.add('hidden');
                setLoadingState(reframerBtn, true, reframerBtnText, reframerIconSparkle, reframerIconSpinner);

                const payload = {
                    feature: "positive_spin", 
                    userGoal: negativeThought
                };
                
                const apiUrl = `/.netlify/functions/api-proxy`;

                try {
                    const result = await fetchWithRetry(apiUrl, payload);

                    if (result && result.response) {
                        reframerResponse.textContent = result.response;
                        reframerResults.classList.remove('hidden');
                        negativeInput.value = '';
                        
                        copyReframerBtn.onclick = () => copyToClipboard(result.response);
                        
                    } else {
                        reframerErrorContainer.classList.remove('hidden');
                        reframerErrorMessage.textContent = "Failed to generate a response. Please try again.";
                    }
                } catch (error) {
                    console.error('API Error:', error);
                    reframerErrorContainer.classList.remove('hidden');
                    reframerErrorMessage.textContent = "There was an error connecting to the service. Please try again.";
                } finally {
                    setLoadingState(reframerBtn, false, reframerBtnText, reframerIconSparkle, reframerIconSpinner);
                }
            }

            // Function to handle the API call for a mindset reset.
            async function handleMindsetReset(e) {
                e.preventDefault(); 
                const stuckReason = stuckInput.value.trim();

                if (!stuckReason) {
                    mindsetErrorContainer.classList.remove('hidden');
                    mindsetErrorMessage.textContent = "Please describe why you're feeling stuck.";
                    return;
                }

                mindsetErrorContainer.classList.add('hidden');
                setLoadingState(mindsetBtn, true, mindsetBtnText, mindsetIconSparkle, mindsetIconSpinner);

                const payload = {
                    feature: "mindset_reset", 
                    userGoal: stuckReason
                };

                const apiUrl = `/.netlify/functions/api-proxy`;

                try {
                    const result = await fetchWithRetry(apiUrl, payload);

                    if (result && result.response) {
                        mindsetResponse.innerHTML = marked.parse(result.response);
                        mindsetResults.classList.remove('hidden');
                        stuckInput.value = '';
                        
                        copyMindsetBtn.onclick = () => copyToClipboard(result.response);

                    } else {
                        mindsetErrorContainer.classList.remove('hidden');
                        mindsetErrorMessage.textContent = "Failed to generate the response. Please try again.";
                    }
                } catch (error) {
                    console.error('API Error:', error);
                    mindsetErrorContainer.classList.remove('hidden');
                    mindsetErrorMessage.textContent = "There was an error connecting to the service. Please try again.";
                } finally {
                    setLoadingState(mindsetBtn, false, mindsetBtnText, mindsetIconSparkle, mindsetIconSpinner);
                }
            }

            // New function to handle the API call for objection responses.
            async function handleObjection(e) {
                e.preventDefault(); 
                const objectionText = objectionInput.value.trim();
                
                if (!objectionText) {
                    objectionErrorContainer.classList.remove('hidden');
                    objectionErrorMessage.textContent = "Please enter an objection to get a response.";
                    return;
                }

                objectionErrorContainer.classList.add('hidden');
                setLoadingState(objectionBtn, true, objectionBtnText, objectionIconSparkle, objectionIconSpinner);

                const payload = {
                    feature: "objection_handler",
                    userGoal: objectionText
                };

                const apiUrl = `/.netlify/functions/api-proxy`;

                try {
                    const result = await fetchWithRetry(apiUrl, payload);

                    if (result && result.response) {
                        objectionResponse.innerHTML = marked.parse(result.response);
                        objectionResults.classList.remove('hidden');
                        objectionInput.value = '';
                        
                        copyObjectionBtn.onclick = () => copyToClipboard(result.response);
                    } else {
                        objectionErrorContainer.classList.remove('hidden');
                        objectionErrorMessage.textContent = "Failed to generate responses. Please try again.";
                    }
                } catch (error) {
                    console.error('API Error:', error);
                    objectionErrorContainer.classList.remove('hidden');
                    objectionErrorMessage.textContent = "There was an error connecting to the service. Please try again.";
                } finally {
                    setLoadingState(objectionBtn, false, objectionBtnText, objectionIconSparkle, objectionIconSpinner);
                }
            }

            // --- Event Listeners and Initial State Setup ---
            reframerForm.addEventListener('submit', handleReframer);
            mindsetForm.addEventListener('submit', handleMindsetReset);
            // New event listener for the Objection Handler
            objectionForm.addEventListener('submit', handleObjection);
            
            // Store original button text
            reframerBtnText.dataset.originalText = "Get a Positive Spin";
            mindsetBtnText.dataset.originalText = "Reset My Mindset";
            // New dataset for the Objection Handler button text
            objectionBtnText.dataset.originalText = "Get Responses";

            // Initial quote display
            quoteReel.textContent = quotes[currentQuoteIndex];
            quoteReel.classList.add('fade-in');
            
            // Initial call to hide all results
            reframerResults.classList.add('hidden');
            mindsetResults.classList.add('hidden');
            objectionResults.classList.add('hidden');
            
        });
    </script>
</body>
</html>
