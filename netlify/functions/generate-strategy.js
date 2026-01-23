<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Leverage Mapper | Social Intelligence</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');

        body { font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; overflow-x: hidden; }

        .glow-header {
            background: linear-gradient(to right, #fff, #22d3ee, #fff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px rgba(34, 211, 238, 0.3);
            animation: shine 5s linear infinite;
        }

        @keyframes shine { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }

        .glow-box { box-shadow: 0 0 20px rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.3); }

        #neural-canvas { position: fixed; top: 0; left: 0; z-index: -1; opacity: 0.3; }

        .glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }

        .pulse-border { animation: pulse-border 2s infinite; }

        @keyframes pulse-border { 0% { border-color: rgba(34, 211, 238, 0.3); } 50% { border-color: rgba(34, 211, 238, 0.8); } 100% { border-color: rgba(34, 211, 238, 0.3); } }
    </style>
</head>
<body class="min-h-screen">
<canvas id="neural-canvas"></canvas>

<div class="max-w-5xl mx-auto px-6 py-12 relative">
    <header class="text-center mb-16">
        <h1 class="text-6xl md:text-8xl font-black glow-header mb-4 italic tracking-tighter">LEVERAGE</h1>
        <p class="text-cyan-400 font-bold tracking-[0.2em] uppercase text-sm">Real-Time Social Pain-Point Identification</p>
    </header>

    <main class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div class="lg:col-span-5 space-y-6">
            <section class="glass p-8 rounded-3xl glow-box">
                <h2 class="text-xl font-bold mb-6 flex items-center">
                    <span class="w-2 h-2 bg-cyan-400 rounded-full mr-2 animate-ping"></span>
                    Social Listening
                </h2>

                <div class="space-y-4">
                    <div>
                        <label class="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Niche or Competitor</label>
                        <input id="socialQuery" type="text" placeholder="e.g. 'Real Estate agents frustrated with Zillow'"
                            class="w-full bg-black/40 border border-white/10 p-4 rounded-xl mt-1 focus:border-cyan-400 outline-none transition-all">
                    </div>

                    <div>
                        <label class="text-[10px] uppercase text-gray-500 font-bold tracking-widest">Lead Targeting Rules</label>
                        <select id="targetLogic" class="w-full bg-black/40 border border-white/10 p-4 rounded-xl mt-1 outline-none">
                            <option value="pain">Identify Unmet Needs/Complaints</option>
                            <option value="funding">Identify Recent Funding/Growth</option>
                            <option value="hiring">Identify Hiring Sprints (Expansion)</option>
                        </select>
                    </div>

                    <button id="scanBtn" class="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black py-4 rounded-xl uppercase tracking-tighter transition-all transform hover:scale-[1.02]">
                        Scan Public Networks
                    </button>
                </div>
            </section>

            <div class="glass p-6 rounded-3xl border-dashed border-white/20">
                <p class="text-xs text-gray-400 italic">"In negotiation, the person with the most information has the most leverage. We find the information."</p>
            </div>
        </div>

        <div class="lg:col-span-7">
            <div id="loading" class="hidden space-y-4">
                <div class="h-64 bg-white/5 animate-pulse rounded-3xl"></div>
            </div>

            <div id="results" class="hidden space-y-6">
                <section class="glass p-8 rounded-3xl border-l-4 border-cyan-400">
                    <span class="text-cyan-400 text-[10px] font-black uppercase tracking-widest">Identified Leverage Point</span>
                    <div id="painOutput" class="text-2xl font-light mt-2 text-white"></div>
                </section>

                <section class="bg-white p-8 rounded-3xl text-black">
                    <span class="text-gray-500 text-[10px] font-black uppercase tracking-widest">The "No-Oriented" CTA</span>
                    <div id="ctaOutput" class="text-xl font-bold mt-2 leading-tight"></div>
                    <button onclick="copyToClipboard('ctaOutput')" class="mt-4 bg-black text-white px-4 py-2 rounded-full text-xs font-bold hover:opacity-80 transition-all">Copy Script</button>
                </section>

                <section class="glass p-8 rounded-3xl">
                    <span class="text-cyan-400 text-[10px] font-black uppercase tracking-widest">Negotiation Guardrails</span>
                    <div id="rulesOutput" class="grid grid-cols-1 gap-4 mt-4"></div>
                </section>
            </div>
        </div>
    </main>
</div>

<script>
const canvas = document.getElementById('neural-canvas');
const ctx = canvas.getContext('2d');
let pts = [];
function init() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; pts = Array.from({length: 80}, () => ({x: Math.random()*canvas.width, y: Math.random()*canvas.height, vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4})); }
function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => { p.x+=p.vx; p.y+=p.vy; if(p.x<0||p.x>canvas.width)p.vx*=-1; if(p.y<0||p.y>canvas.height)p.vy*=-1; ctx.fillStyle='#22d3ee'; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill(); });
    pts.forEach((p,i)=>{for(let j=i+1;j<pts.length;j++){let d=Math.hypot(p.x-pts[j].x,p.y-pts[j].y); if(d<150){ctx.strokeStyle=`rgba(34,211,238,${1-d/150})`; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke();}}});
    requestAnimationFrame(draw);
}
window.onresize=init; init(); draw();

document.getElementById('scanBtn').onclick = async () => {
    const query = document.getElementById('socialQuery').value;
    const logic = document.getElementById('targetLogic').value;
    if(!query) return;

    const btn = document.getElementById('scanBtn');
    const loader = document.getElementById('loading');
    const res = document.getElementById('results');

    btn.disabled=true; btn.innerText="Analyzing Social Sentiment..."; loader.classList.remove('hidden'); res.classList.add('hidden');

    try {
        const response = await fetch('https://ryguyapi.netlify.app/.netlify/functions/generate-strategy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: query, context: logic })
        });

        const data = await response.json();

        document.getElementById('painOutput').innerText = data.pain_point;
        document.getElementById('ctaOutput').innerText = data.cta;
        document.getElementById('rulesOutput').innerHTML = data.rules.map(r=>`
            <div class="bg-white/5 p-4 rounded-xl border border-white/10">
                <div class="text-cyan-400 font-bold text-sm mb-1">${r.title}</div>
                <div class="text-xs text-gray-400">${r.description}</div>
            </div>
        `).join('');

        res.classList.remove('hidden');
    } catch(e) {
        alert("Error connecting to Intelligence Engine: "+e.message);
    } finally {
        loader.classList.add('hidden'); btn.disabled=false; btn.innerText="Scan Public Networks";
    }
};

function copyToClipboard(id){
    const text=document.getElementById(id).innerText;
    navigator.clipboard.writeText(text);
    alert("Script copied. Go win.");
}
</script>
</body>
</html>
