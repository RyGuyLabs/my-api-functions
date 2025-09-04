const API_BASE = 'https://ryguyapi.netlify.app/.netlify/functions/dashboard';

let leads = [];
let goalsData = {
  morning: { text:'', time:'', completed:false },
  afternoon: { text:'', time:'', completed:false },
  evening: { text:'', time:'', completed:false }
};

let currentFilter = 'all';
let statusChart, timelineChart, purposeChart;

// ---------------------------
// Local Storage
// ---------------------------
function savePlannerData(){
  try { localStorage.setItem('goalsData', JSON.stringify(goalsData)); }
  catch(e){ console.error("Save planner error:", e); }
}
function loadPlannerData(){
  try {
    const saved = JSON.parse(localStorage.getItem('goalsData'));
    if (saved) goalsData = saved;
  } catch(e){ console.error("Load planner error:", e); }
}

// ---------------------------
// Leads
// ---------------------------
function saveLeadsData(){
  try { localStorage.setItem('leadsData', JSON.stringify(leads)); }
  catch(e){ console.error("Save leads error:", e); }
}
function loadLeadsData(){
  try {
    const saved = JSON.parse(localStorage.getItem('leadsData'));
    if (Array.isArray(saved)) leads = saved;
  } catch(e){ console.error("Load leads error:", e); }
  renderLeadsTable(); updateFunnelCounts(); updateCharts();
}

function renderLeadsTable(){
  const tbody = document.getElementById('contactTableBody');
  tbody.innerHTML = '';
  const filtered = currentFilter==='all' ? leads : leads.filter(l=>l.status===currentFilter);
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-slate-400">No leads to display. Add one to get started!</td></tr>`;
    return;
  }
  filtered.forEach(lead=>{
    const statusClass = `status-${(lead.status || 'Prospect').toLowerCase()}`;
    const row = document.createElement('tr');
    row.className = 'hover:bg-slate-700 transition-colors duration-200';
    row.innerHTML = `
      <td class="px-6 py-4 text-sm text-slate-300">${lead.date}</td>
      <td class="px-6 py-4 text-sm font-medium text-slate-200">${lead.name}</td>
      <td class="px-6 py-4 text-sm text-slate-300">${lead.company}</td>
      <td class="px-6 py-4 text-sm text-slate-300">${lead.purpose}</td>
      <td class="px-6 py-4 text-sm text-slate-300">${lead.contactType}</td>
      <td class="px-6 py-4 text-sm text-slate-300">${lead.timeOfDay}</td>
      <td class="px-6 py-4 text-sm ${statusClass}">${lead.status}</td>
      <td class="px-6 py-4 text-center text-sm font-medium">
        <button onclick="updateStatus(${lead.id})" class="px-2 py-1 mr-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-200">Update</button>
        <button onclick="deleteLead(${lead.id})" class="px-2 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors duration-200">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

window.updateStatus = function(id){
  const i = leads.findIndex(l=>l.id===id);
  if (i<0) return;
  const leadStatuses = ['Prospect','Cold','Warm','Hot','Converted'];
  const idx = leadStatuses.indexOf(leads[i].status);
  leads[i].status = leadStatuses[(idx+1)%leadStatuses.length];
  saveLeadsData(); renderLeadsTable(); updateFunnelCounts(); updateCharts();
}

window.deleteLead = function(id){
  leads = leads.filter(l=>l.id!==id);
  saveLeadsData(); renderLeadsTable(); updateFunnelCounts(); updateCharts();
  showNotification("Lead deleted.");
}

window.filterLeads = function(status){
  currentFilter = status;
  renderLeadsTable();
}

function updateFunnelCounts(){
  const counts = leads.reduce((acc, l)=>{ acc[l.status]=(acc[l.status]||0)+1; return acc; },{});
  document.getElementById('prospectCount').textContent = counts['Prospect'] || 0;
  document.getElementById('coldCount').textContent     = counts['Cold'] || 0;
  document.getElementById('warmCount').textContent     = counts['Warm'] || 0;
  document.getElementById('hotCount').textContent      = counts['Hot'] || 0;
  document.getElementById('convertedCount').textContent= counts['Converted'] || 0;
}

// ---------------------------
// Charts
// ---------------------------
function updateCharts(){
  const statusLabels = ['Prospect','Cold','Warm','Hot','Converted'];
  const statusCounts = statusLabels.map(s => leads.filter(l=>l.status===s).length);

  const byDateMap = {};
  leads.forEach(l=>{ byDateMap[l.date]=(byDateMap[l.date]||0)+1; });
  const timelineLabels = Object.keys(byDateMap).sort((a,b)=>{
    const [am,ad,ay]=a.split('/'); const [bm,bd,by]=b.split('/');
    return new Date(ay,am-1,ad)-new Date(by,bm-1,bd);
  });
  const timelineCounts = timelineLabels.map(d=>byDateMap[d]);

  const purposeMap = {};
  leads.forEach(l=>{ purposeMap[(l.purpose||'Unspecified').trim()||'Unspecified']=(purposeMap[(l.purpose||'Unspecified').trim()||'Unspecified']||0)+1; });
  const purposeLabels = Object.keys(purposeMap);
  const purposeCounts = purposeLabels.map(k=>purposeMap[k]);

  const statusCanvas = document.getElementById('statusChart');
  const timelineCanvas = document.getElementById('timelineChart');
  const purposeCanvas = document.getElementById('purposeChart');
  if (!statusCanvas || !timelineCanvas || !purposeCanvas) return;

  const statusCtx = statusCanvas.getContext('2d');
  const timelineCtx = timelineCanvas.getContext('2d');
  const purposeCtx = purposeCanvas.getContext('2d');

  if (statusChart) statusChart.destroy();
  if (timelineChart) timelineChart.destroy();
  if (purposeChart) purposeChart.destroy();

  statusChart = new Chart(statusCtx, { type:'bar', data:{ labels:statusLabels, datasets:[{ label:'Leads by Status', data:statusCounts }] }, options:{ responsive:true, maintainAspectRatio:false } });
  timelineChart = new Chart(timelineCtx, { type:'line', data:{ labels:timelineLabels, datasets:[{ label:'Leads Added', data:timelineCounts, tension:0.3, fill:false }] }, options:{ responsive:true, maintainAspectRatio:false } });
  purposeChart = new Chart(purposeCtx, { type:'pie', data:{ labels:purposeLabels, datasets:[{ label:'Purpose of Contact', data:purposeCounts }] }, options:{ responsive:true, maintainAspectRatio:false } });
}

// ---------------------------
// Background Particles
// ---------------------------
const canvas = document.getElementById('particleCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let particles = []; const particleCount = 100;
function resizeCanvas(){ if (!canvas) return; canvas.width=window.innerWidth; canvas.height=window.innerHeight; if (!particles.length) createParticles(); }
function createParticles(){ particles=[]; for(let i=0;i<particleCount;i++){ particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, size:Math.random()*2+1, speedX:Math.random()*0.5-0.25, speedY:Math.random()*0.5-0.25, color:'rgba(255,255,255,'+(Math.random()*0.5+0.1)+')' }); } }
function updateParticles(){ particles.forEach(p=>{ p.x+=p.speedX; p.y+=p.speedY; if(p.x<0||p.x>canvas.width) p.speedX*=-1; if(p.y<0||p.y>canvas.height) p.speedY*=-1; }); }
function drawParticles(){ ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill(); }); }
function animate(){ requestAnimationFrame(animate); updateParticles(); drawParticles(); }

// ---------------------------
// POST to API (Gemini)
// ---------------------------
async function postToAPI(feature, data){
  try{
    const res = await fetch(API_BASE, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ feature, data })
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    return json.result || json.message || 'No response.';
  } catch(e){
    console.error(e);
    throw e;
  }
}

// ---------------------------
// Event Listeners for AI Features
// ---------------------------
document.getElementById('dailyInspirationBtn').addEventListener('click', async ()=>{
  const btn=document.getElementById('dailyInspirationBtn');
  const textEl=document.getElementById('inspirationText');
  const output=document.getElementById('inspirationOutput');
  const btnText=document.getElementById('inspirationBtnText');
  const spinner=document.getElementById('inspirationLoadingSpinner');
  btn.disabled=true; btnText.classList.add('hidden'); spinner.classList.remove('hidden'); output.classList.add('hidden');
  try{
    textEl.textContent = await postToAPI('daily_inspiration', {}) + "\n\nYou Got This with RyGuyLabs";
    output.classList.remove('hidden');
  }catch(e){ textEl.textContent=`Error: ${e.message}`; output.classList.remove('hidden'); }
  finally{ btn.disabled=false; btnText.classList.remove('hidden'); spinner.classList.add('hidden'); }
});

// ... Similar listeners for morningBriefing, goalsSummary, decomposeGoal, generateIdea, nurturingNote
// (Use the same structure as in the Squarespace script above)

window.addEventListener('load', ()=>{
  loadPlannerData(); loadLeadsData();
  resizeCanvas(); animate();
});

window.addEventListener('resize', resizeCanvas);
