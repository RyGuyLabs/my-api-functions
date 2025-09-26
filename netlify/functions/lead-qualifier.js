<div id="sales-lead-qualifier"></div>

<!-- Styles -->
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
html, body {
  margin: 0; padding: 0;
  font-family: 'Inter', sans-serif;
  background: linear-gradient(to bottom, #1e3a8a,#0c4a6e);
  color: #e2e8f0;
}
.card {
  background-color: rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 4px 6px rgba(0,0,0,0.1),0 1px 3px rgba(0,0,0,0.08),0 0 20px rgba(59,130,246,0.5);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.card:hover { transform: translateY(-2px); }
input, textarea, select {
  background-color: rgba(255,255,255,0.9);
  border-color: rgba(255,255,255,0.5);
  color: #1e293b;
}
input::placeholder, textarea::placeholder { color: #4b5563; }
.btn-primary {
  background-color: #3b82f6; color: white;
  transition: 0.2s ease;
}
.btn-primary:hover { background-color:#2563eb; transform: translateY(-1px); }
.list-item { background-color: rgba(255,255,255,0.1); color:#e2e8f0; cursor: pointer; }
.list-item:hover { background-color: rgba(255,255,255,0.2); }
.list-item.active { box-shadow: 0 0 0 2px #3b82f6; border-color:#3b82f6; }
.header-glow { text-shadow:0 0 15px #bfdbfe,0 0 30px #bfdbfe,0 0 45px #93c5fd; }
.toast {
  position: fixed; top: 20px; right: 20px;
  background: #2563eb; color: #fff;
  padding: 12px 20px; border-radius: 8px;
  box-shadow:0 4px 6px rgba(0,0,0,0.1);
  opacity:0; pointer-events:none;
  transition: opacity 0.3s ease;
  z-index:999;
}
.toast.show { opacity:1; pointer-events:auto; }
.spinner {
  border: 4px solid rgba(255,255,255,0.3);
  border-top: 4px solid #fff;
  border-radius: 50%; width: 24px; height: 24px;
  animation: spin 1s linear infinite;
  margin-left: 8px;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.collapsible-header { cursor: pointer; }
.collapsible-header i { transition: transform 0.3s ease; }
.collapsible-header.collapsed i { transform: rotate(-90deg); }
.content-hidden { max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; }
.content-expanded { max-height: 1000px; transition: max-height 0.3s ease-in; }
.copy-btn:disabled { color: #4b5563; cursor: not-allowed; }
.progress-bar-container {
  width: 100%;
  background-color: #4a5568;
  border-radius: 9999px;
  overflow: hidden;
  height: 1.5rem;
}
.progress-bar {
  height: 100%;
  background-color: #38b2ac;
  transition: width 0.5s ease-in-out, background-color 0.5s ease;
  text-align: center;
  line-height: 1.5rem;
  font-weight: bold;
  color: #fff;
}
</style>

<!-- Tailwind + Font Awesome -->
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- Layout -->
<div class="max-w-7xl p-4 md:p-8 mx-auto space-y-8">
  <!-- Header -->
  <header class="card rounded-xl p-6 text-center">
    <h1 class="text-5xl md:text-6xl font-extrabold text-white tracking-tight header-glow">
      <i class="fas fa-handshake mr-2 text-blue-300"></i>Sales Lead Qualifier
    </h1>
    <p class="mt-2 text-blue-200 text-sm md:text-base">Lead analysis with Ideal Client matching.</p>
  </header>

  <!-- Main -->
  <main class="grid lg:grid-cols-3 gap-8">
    <!-- Left Column -->
    <div class="lg:col-span-1 space-y-8">
      <div class="card rounded-xl p-6">
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Ideal Client Form -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-bold text-blue-200">Ideal Client Profile</h2>
              <button id="clear-ideal-client-btn" class="btn-primary text-sm py-1 px-3 rounded-md">Clear</button>
            </div>
            <form id="ideal-client-form" class="space-y-4">
              <div><label class="block text-sm text-blue-200">Industry</label>
              <select id="client-industry" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select industry...</option>
                <option value="Technology">Technology</option>
                <option value="Finance">Finance</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Retail">Retail</option>
                <option value="Education">Education</option>
                <option value="Other">Other</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Company Size</label>
              <select id="client-size" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select size...</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-1000">201-1000 employees</option>
                <option value="1001-5000">1001-5000 employees</option>
                <option value="5000+">5000+ employees</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Annual Revenue</label>
              <select id="client-revenue" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select revenue...</option>
                <option value="<$1M"><$1M</option>
                <option value="$1M-$10M">$1M-$10M</option>
                <option value="$10M-$50M">$10M-$50M</option>
                <option value="$50M-$250M">$50M-$250M</option>
                <option value="$250M+">$250M+</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Decision Maker Role</label>
              <select id="client-role" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select role...</option>
                <option value="Executive">Executive (CEO, Founder)</option>
                <option value="Director">Director / VP</option>
                <option value="Manager">Manager</option>
                <option value="Specialist">Specialist / Engineer</option>
                <option value="Other">Other</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Other Notes</label>
              <textarea id="client-notes" rows="2" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm"></textarea></div>
              <button type="submit" class="w-full btn-primary font-semibold py-2 px-4 rounded-md shadow-md">Save Ideal Client</button>
            </form>
          </div>

          <!-- Lead Form -->
          <div class="space-y-6">
            <h2 class="text-xl font-bold text-blue-200">Qualify a New Lead</h2>
            <form id="lead-form" class="space-y-4">
              <div><label class="block text-sm text-blue-200">Lead Name</label>
              <input type="text" id="lead-name" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm"></div>
              <div><label class="block text-sm text-blue-200">Company</label>
              <input type="text" id="lead-company" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm"></div>
              <!-- New Demographics Fields -->
              <div><label class="block text-sm text-blue-200">Industry</label>
              <select id="lead-industry" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select industry...</option>
                <option value="Technology">Technology</option>
                <option value="Finance">Finance</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Retail">Retail</option>
                <option value="Education">Education</option>
                <option value="Other">Other</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Company Size</label>
              <select id="lead-size" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select size...</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-1000">201-1000 employees</option>
                <option value="1001-5000">1001-5000 employees</option>
                <option value="5000+">5000+ employees</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Annual Revenue</label>
              <select id="lead-revenue" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select revenue...</option>
                <option value="<$1M"><$1M</option>
                <option value="$1M-$10M">$1M-$10M</option>
                <option value="$10M-$50M">$10M-$50M</option>
                <option value="$50M-$250M">$50M-$250M</option>
                <option value="$250M+">$250M+</option>
              </select></div>
              <div><label class="block text-sm text-blue-200">Decision Maker Role</label>
              <select id="lead-role" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm">
                <option value="">Select role...</option>
                <option value="Executive">Executive (CEO, Founder)</option>
                <option value="Director">Director / VP</option>
                <option value="Manager">Manager</option>
                <option value="Specialist">Specialist / Engineer</option>
                <option value="Other">Other</option>
              </select></div>
              <!-- End of New Demographics Fields -->
              <div><label class="block text-sm text-blue-200">Budget</label>
              <input type="text" id="lead-budget" placeholder="$50,000" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm"></div>
              <div><label class="block text-sm text-blue-200">Timeline</label>
              <input type="text" id="lead-timeline" placeholder="e.g., 3 months" class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm"></div>
              <div><label class="block text-sm text-blue-200">Specific Needs</label>
              <textarea id="lead-needs" rows="3" required class="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm"></textarea></div>
              <button type="submit" id="submit-btn" class="w-full btn-primary font-semibold py-2 px-4 rounded-md shadow-md flex items-center justify-center">
                <span id="submit-text">Qualify Lead</span>
                <div id="loading-spinner" class="spinner hidden"></div>
              </button>
            </form>
          </div>
        </div>
      </div>
      
      <!-- Saved Data Section -->
      <div class="grid md:grid-cols-2 gap-6">
          <!-- Saved Ideal Client Display -->
          <div class="card rounded-xl p-6 space-y-4" id="saved-ideal-client-card">
              <h2 class="text-xl font-bold text-blue-200">Saved Ideal Client</h2>
              <div id="saved-ideal-client" class="text-blue-300 text-sm">
                  <p>No profile saved yet.</p>
              </div>
          </div>
          <!-- Saved Leads List -->
          <div class="card rounded-xl p-6 space-y-4">
            <div class="flex justify-between items-center">
              <h2 class="text-xl font-bold text-blue-200">Saved Leads</h2>
              <button id="clear-leads-btn" class="btn-primary text-sm py-1 px-3 rounded-md">Clear All</button>
            </div>
            <div id="leads-list" class="space-y-2"><p class="text-center text-blue-300">No leads saved yet.</p></div>
          </div>
      </div>
    </div>

    <!-- Right Column: Reports -->
    <div class="lg:col-span-2 space-y-8">
      <!-- Lead Score -->
      <div id="lead-score-section" class="card rounded-xl p-6 hidden">
        <h2 class="text-xl font-bold text-blue-200 mb-2">Lead Score</h2>
        <div class="flex items-center mb-4">
          <span id="lead-score-value" class="text-5xl font-extrabold mr-4 text-white">0%</span>
          <div class="progress-bar-container">
            <div id="lead-score-bar" class="progress-bar rounded-full" style="width: 0%;"></div>
          </div>
        </div>
      </div>

      <div class="card rounded-xl p-6">
        <div class="flex items-center justify-between collapsible-header" data-target="report-content-container">
          <h2 class="text-xl font-bold text-blue-200">Report</h2>
          <div>
            <button class="text-white text-lg mr-2 copy-btn" data-target-id="report-content"><i class="fas fa-copy"></i></button>
            <i class="fas fa-chevron-down text-blue-300"></i>
          </div>
        </div>
        <div id="report-content-container" class="mt-2 content-expanded"><div id="report-content" class="text-lg"></div></div>
      </div>

      <div class="card rounded-xl p-6">
        <div class="flex items-center justify-between collapsible-header" data-target="predictive-content-container">
          <h2 class="text-xl font-bold text-blue-200">Predictive Insights</h2>
          <div>
            <button class="text-white text-lg mr-2 copy-btn" data-target-id="predictive-content"><i class="fas fa-copy"></i></button>
            <i class="fas fa-chevron-down text-blue-300"></i>
          </div>
        </div>
        <div id="predictive-content-container" class="mt-2 content-expanded"><div id="predictive-content" class="text-lg"></div></div>
      </div>

      <div class="card rounded-xl p-6">
        <div class="flex items-center justify-between collapsible-header" data-target="outreach-content-container">
          <h2 class="text-xl font-bold text-blue-200">Outreach Strategy</h2>
          <div>
            <button class="text-white text-lg mr-2 copy-btn" data-target-id="outreach-content"><i class="fas fa-copy"></i></button>
            <i class="fas fa-chevron-down text-blue-300"></i>
          </div>
        </div>
        <div id="outreach-content-container" class="mt-2 content-expanded"><div id="outreach-content" class="text-lg"></div></div>
      </div>

      <div class="card rounded-xl p-6">
        <div class="flex items-center justify-between collapsible-header" data-target="questions-content-container">
          <h2 class="text-xl font-bold text-blue-200">Suggested Questions</h2>
          <div>
            <button class="text-white text-lg mr-2 copy-btn" data-target-id="questions-content"><i class="fas fa-copy"></i></button>
            <i class="fas fa-chevron-down text-blue-300"></i>
          </div>
        </div>
        <div id="questions-content-container" class="mt-2 content-expanded"><div id="questions-content" class="text-lg"></div></div>
      </div>
      
      <!-- Relevant News Section -->
      <div class="card rounded-xl p-6">
        <div class="flex items-center justify-between collapsible-header" data-target="news-content-container">
          <h2 class="text-xl font-bold text-blue-200">Relevant News</h2>
          <div>
            <button class="text-white text-lg mr-2 copy-btn" data-target-id="news-content"><i class="fas fa-copy"></i></button>
            <i class="fas fa-chevron-down text-blue-300"></i>
          </div>
        </div>
        <div id="news-content-container" class="mt-2 content-expanded"><div id="news-content" class="text-lg"></div></div>
      </div>
    </div>
  </main>
</div>

<div id="toast" class="toast"></div>

<!-- JS -->
<script>
document.addEventListener('DOMContentLoaded', function () {
  const leadForm = document.getElementById('lead-form');
  const idealForm = document.getElementById('ideal-client-form');
  const savedIdealClientCard = document.getElementById('saved-ideal-client-card');
  const savedIdealClientEl = document.getElementById('saved-ideal-client');
  const leadsList = document.getElementById('leads-list');
  const toastEl = document.getElementById('toast');
  const submitText = document.getElementById('submit-text');
  const loadingSpinner = document.getElementById('loading-spinner');
  const submitBtn = document.getElementById('submit-btn');
  const clearIdealClientBtn = document.getElementById('clear-ideal-client-btn');
  const leadScoreSection = document.getElementById('lead-score-section');
  const leadScoreValue = document.getElementById('lead-score-value');
  const leadScoreBar = document.getElementById('lead-score-bar');
  const reportSections = [
    { id: 'report-content', containerId: 'report-content-container' },
    { id: 'predictive-content', containerId: 'predictive-content-container' },
    { id: 'outreach-content', containerId: 'outreach-content-container' },
    { id: 'questions-content', containerId: 'questions-content-container' },
    { id: 'news-content', containerId: 'news-content-container' }
  ];
  const copyButtons = document.querySelectorAll('.copy-btn');
  const apiKey = ""; // Canvas will provide this.

  let idealClient = {};
  let leads = [];

  // --- Utility Functions ---
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3000);
  }

  // --- Data Persistence Functions ---
  function saveToLocalStorage() {
      try {
          localStorage.setItem('idealClient', JSON.stringify(idealClient));
          localStorage.setItem('leads', JSON.stringify(leads));
      } catch (e) {
          console.error("Could not save to localStorage. It may be disabled.", e);
      }
  }

  function loadFromLocalStorage() {
      try {
          const savedIdealClient = localStorage.getItem('idealClient');
          const savedLeads = localStorage.getItem('leads');
          if (savedIdealClient) {
              idealClient = JSON.parse(savedIdealClient);
              renderIdealClient();
          }
          if (savedLeads) {
              leads = JSON.parse(savedLeads);
              renderLeads();
              if (leads.length > 0) {
                  const firstLeadItem = leadsList.querySelector('.list-item');
                  firstLeadItem.classList.add('active');
                  renderReport(leads[0]);
              }
          }
      } catch (e) {
          console.error("Could not load from localStorage.", e);
      }
  }
  
  // --- Rendering & UI Functions ---
  function renderIdealClient() {
      if (Object.keys(idealClient).length === 0) {
          savedIdealClientEl.innerHTML = `<p class="text-blue-300">No profile saved yet.</p>`;
          idealForm.reset();
      } else {
          let detailsHtml = '<ul class="list-disc list-inside space-y-1">';
          for (const key in idealClient) {
              if (idealClient[key]) {
                  detailsHtml += `<li><strong class="capitalize">${key.replace('-', ' ')}:</strong> ${idealClient[key]}</li>`;
              }
          }
          detailsHtml += '</ul>';
          savedIdealClientEl.innerHTML = detailsHtml;
          savedIdealClientCard.classList.add('border-green-400');
          Object.keys(idealClient).forEach(key => {
              const input = document.getElementById(`client-${key}`);
              if (input) input.value = idealClient[key];
          });
      }
  }

  function renderLeads() {
      leadsList.innerHTML = "";
      if (leads.length === 0) {
          leadsList.innerHTML = `<p class="text-center text-blue-300">No leads saved yet.</p>`;
          return;
      }
      leads.forEach((lead, index) => {
          const div = document.createElement('div');
          div.className = "list-item p-2 rounded-md";
          div.textContent = `${lead.name} @ ${lead.company}`;
          div.setAttribute('data-index', index);
          leadsList.appendChild(div);
      });
  }

  function renderReport(reportData) {
      // Show or hide the lead score section
      if (reportData.leadScore !== undefined) {
          leadScoreSection.classList.remove('hidden');
          const score = reportData.leadScore;
          leadScoreValue.textContent = `${score}%`;
          leadScoreBar.style.width = `${score}%`;
          if (score > 75) {
              leadScoreBar.style.backgroundColor = '#48bb78'; // Green
          } else if (score > 50) {
              leadScoreBar.style.backgroundColor = '#ecc94b'; // Yellow
          } else {
              leadScoreBar.style.backgroundColor = '#f56565'; // Red
          }
      } else {
          leadScoreSection.classList.add('hidden');
      }

      reportSections.forEach(section => {
          const element = document.getElementById(section.id);
          const copyBtn = document.querySelector(`.copy-btn[data-target-id="${section.id}"]`);
          const content = reportData[section.id.replace('-content', '')];
          
          if (section.id === 'predictive-content') {
              if (typeof content === 'string' && content.length > 0) {
                  const formattedContent = content.replace(/\*(.*?)\*/g, '<b>$1</b>');
                  element.innerHTML = formattedContent;
                  copyBtn.disabled = false;
              } else {
                  element.innerHTML = `<p class="text-blue-300">No predictive insights available.</p>`;
                  copyBtn.disabled = true;
              }
          } else if (section.id === 'outreach-content') {
              if (typeof content === 'string' && content.length > 0) {
                  const lines = content.split('\n');
                  let formattedHtml = '';
                  let isFirstLine = true;
                  lines.forEach(line => {
                      if (isFirstLine) {
                          formattedHtml += `<b>Subject:</b> ${line.trim()}<br><br>`;
                          isFirstLine = false;
                      } else {
                          formattedHtml += `${line.trim()}<br>`;
                      }
                  });
                  element.innerHTML = formattedHtml;
                  copyBtn.disabled = false;
              } else {
                  element.innerHTML = `<p class="text-blue-300">No outreach strategy available.</p>`;
                  copyBtn.disabled = true;
              }
          } else if (section.id === 'questions-content') {
            let questions = [];
            if (Array.isArray(content)) {
              questions = content.map(q => q.trim().replace(/^\*\s*/, ''));
            } else if (typeof content === 'string' && content.trim().length > 0) {
              questions = content.split('\n')
                                 .map(q => q.trim())
                                 .filter(q => q.length > 0)
                                 .map(q => q.startsWith('* ') ? q.substring(2) : q);
            }
            
            if (questions.length > 0) {
              let questionsHtml = '<ol class="list-decimal list-inside space-y-2">';
              questions.forEach(q => {
                  const formattedQuestion = q.trim().endsWith('?') ? q.trim() : `${q.trim()}?`;
                  questionsHtml += `<li>${formattedQuestion}</li>`;
              });
              questionsHtml += '</ol>';
              element.innerHTML = questionsHtml;
              copyBtn.disabled = false;
            } else {
              element.innerHTML = `<p class="text-blue-300">No suggested questions available.</p>`;
              copyBtn.disabled = true;
            }
          } else if (section.id === 'news-content') {
              // Now correctly using the 'news' key and formatting the content with <br> tags.
              const newsContent = reportData.news;
              if (typeof newsContent === 'string' && newsContent.length > 0) {
                  const formattedNews = newsContent.replace(/\n/g, '<br>');
                  element.innerHTML = formattedNews;
                  copyBtn.disabled = false;
              } else {
                  element.innerHTML = `<p class="text-blue-300">No relevant news found for this lead.</p>`;
                  copyBtn.disabled = true;
              }
          } else { // Handles general reports
              if (typeof content === 'string' && content.length > 0) {
                  const formattedText = content
                      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
                      .replace(/^- (.*?)(\n|$)/gm, '<li>$1</li>') // Unordered lists
                      .replace(/^(\d+\.) (.*?)(\n|$)/gm, '<li>$2</li>'); // Numbered lists
                  element.innerHTML = formattedText;
                  copyBtn.disabled = false;
              } else {
                  element.innerHTML = `<p class="text-blue-300">No report available.</p>`;
                  copyBtn.disabled = true;
              }
          }
      });
  }
  
  function handleApiError(message) {
      const errorMessage = message || "There was an error generating the report. Please try again.";
      reportSections.forEach(section => {
          const element = document.getElementById(section.id);
          const copyBtn = document.querySelector(`.copy-btn[data-target-id="${section.id}"]`);
          element.innerHTML = `<p class="text-red-300">${errorMessage}</p>`;
          copyBtn.disabled = true;
      });
      // Hide the lead score section on error
      leadScoreSection.classList.add('hidden');
  }

  // --- Event Handlers ---
  function handleIdealClientForm(e) {
      e.preventDefault();
      idealClient = {
          industry: document.getElementById('client-industry').value,
          size: document.getElementById('client-size').value,
          revenue: document.getElementById('client-revenue').value,
          role: document.getElementById('client-role').value,
          notes: document.getElementById('client-notes').value,
      };
      renderIdealClient();
      saveToLocalStorage();
      showToast("Ideal client profile saved.");
  }

  async function handleLeadForm(e) {
      e.preventDefault();
      
      const leadData = {
          name: document.getElementById('lead-name').value,
          company: document.getElementById('lead-company').value,
          industry: document.getElementById('lead-industry').value,
          size: document.getElementById('lead-size').value,
          revenue: document.getElementById('lead-revenue').value,
          role: document.getElementById('lead-role').value,
          budget: document.getElementById('lead-budget').value,
          timeline: document.getElementById('lead-timeline').value,
          needs: document.getElementById('lead-needs').value,
      };

      // Loading state
      submitText.textContent = "Qualifying...";
      loadingSpinner.classList.remove('hidden');
      submitBtn.disabled = true;
      renderReport({ report: '', predictive: '', outreach: '', questions: [], news: '', leadScore: 0 });

      const SERVERLESS_ENDPOINT = "https://ryguyapi.netlify.app/.netlify/functions/lead-qualifier";

      try {
          // Fetch the raw text to handle potential JSON parsing issues
          const reportResponse = await fetch(SERVERLESS_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ leadData: leadData, idealClient: idealClient })
          });

          if (!reportResponse.ok) {
              const errorText = await reportResponse.text();
              throw new Error(`Report API call failed with status ${reportResponse.status}: ${errorText}`);
          }
          
          let reportData;
          try {
              // Attempt to parse the JSON normally
              reportData = await reportResponse.json();
          } catch (jsonError) {
              console.error("Initial JSON parsing failed, attempting to fix...", jsonError);
              const rawText = await reportResponse.text();
              // Clean up malformed escaped characters before parsing
              const cleanedText = rawText.replace(/\\"/g, '"').replace(/\\\\n/g, '\\n');
              reportData = JSON.parse(cleanedText);
          }

          console.log("Received Report Data from Serverless Function:", reportData);
          
          const newLead = { 
              ...leadData, 
              report: reportData.report, 
              predictive: reportData.predictive, 
              outreach: reportData.outreach, 
              questions: reportData.questions,
              news: reportData.news,
              leadScore: reportData.leadScore 
          };
          
          leads.push(newLead);
          renderLeads();
          renderReport(newLead);
          saveToLocalStorage();
          
          leadsList.querySelectorAll('.list-item').forEach(item => item.classList.remove('active'));
          const newLeadItem = leadsList.querySelector(`[data-index="${leads.length - 1}"]`);
          if (newLeadItem) newLeadItem.classList.add('active');
          showToast("Lead qualified successfully!");
          leadForm.reset();
      } catch (error) {
          console.error("Failed to qualify lead:", error);
          handleApiError(error.message);
      } finally {
          submitText.textContent = "Qualify Lead";
          loadingSpinner.classList.add('hidden');
          submitBtn.disabled = false;
      }
  }

  function handleLeadSelection(e) {
      if (e.target.classList.contains('list-item')) {
          leadsList.querySelectorAll('.list-item').forEach(item => item.classList.remove('active'));
          e.target.classList.add('active');
          const index = parseInt(e.target.getAttribute('data-index'));
          const selectedLead = leads[index];
          renderReport(selectedLead);
      }
  }

  function handleClearLeads() {
      leads = [];
      saveToLocalStorage();
      renderLeads();
      renderReport({});
      showToast("All saved leads have been cleared.");
  }

  function handleClearIdealClient() {
      idealClient = {};
      saveToLocalStorage();
      renderIdealClient();
      showToast("Ideal client profile cleared.");
  }

  function handleCollapsibleClick(e) {
    const header = e.target.closest('.collapsible-header');
    if (header) {
      const targetId = header.getAttribute('data-target');
      const targetElement = document.getElementById(targetId);
      const icon = header.querySelector('i');
      if (targetElement && icon) {
        const isCollapsed = targetElement.classList.contains('content-hidden');
        if (isCollapsed) {
          targetElement.classList.remove('content-hidden');
          targetElement.classList.add('content-expanded');
          icon.classList.remove('collapsed');
        } else {
          targetElement.classList.remove('content-expanded');
          targetElement.classList.add('content-hidden');
          icon.classList.add('collapsed');
        }
      }
    }
  }

  function handleCopy(e) {
      const button = e.target.closest('.copy-btn');
      if (button) {
          const targetId = button.getAttribute('data-target-id');
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
              const textToCopy = targetEl.textContent.trim();
              if (textToCopy) {
                  const tempInput = document.createElement('textarea');
                  tempInput.value = textToCopy;
                  document.body.appendChild(tempInput);
                  tempInput.select();
                  document.execCommand('copy');
                  document.body.removeChild(tempInput);
                  showToast("Content copied to clipboard!");
              } else {
                  showToast("Nothing to copy.");
              }
          }
      }
  }

  // Initial load
  loadFromLocalStorage();

  // Attach event listeners
  idealForm.addEventListener('submit', handleIdealClientForm);
  leadForm.addEventListener('submit', handleLeadForm);
  leadsList.addEventListener('click', handleLeadSelection);
  document.getElementById('clear-leads-btn').addEventListener('click', handleClearLeads);
  clearIdealClientBtn.addEventListener('click', handleClearIdealClient);
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', handleCollapsibleClick);
  });
  copyButtons.forEach(button => {
    button.addEventListener('click', handleCopy);
  });
});
</script>


