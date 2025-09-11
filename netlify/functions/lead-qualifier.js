generateBtn.addEventListener('click', async () => {
  const leadData = {};
  leadFields.forEach(field => {
    leadData[field.toLowerCase().replace(/\s/g,'-')] = document.getElementById(field.toLowerCase().replace(/\s/g,'-')).value;
  });
  const includeDemographics = document.getElementById('include-demographics').checked;

  outputContainer.classList.remove('hidden');
  const outputBox = document.getElementById('qualifier-output');
  const newsOutput = document.getElementById('news-output');
  const predictiveOutput = document.getElementById('predictive-output');
  const outreachOutput = document.getElementById('outreach-output');
  const questionsOutput = document.getElementById('questions-output');

  // Disable button while generating
  generateBtn.disabled = true;
  outputBox.textContent = 'Generating...';
  newsOutput.textContent = predictiveOutput.textContent = outreachOutput.textContent = questionsOutput.textContent = '';

  try {
    const response = await fetch('https://ryguyapi.netlify.app/.netlify/functions/lead-qualifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadData, includeDemographics })
    });
    if(!response.ok) throw new Error(`Server responded with ${response.status}`);
    const data = await response.json();

    outputBox.textContent = data.report || 'No report generated';
    newsOutput.textContent = data.news || '';
    predictiveOutput.textContent = data.predictive || '';
    outreachOutput.textContent = data.outreach || '';
    questionsOutput.textContent = data.questions || '';

    ['news','predictive','outreach','questions'].forEach(id => {
      document.getElementById(id+'-output').classList.remove('hidden');
      document.getElementById(id+'-header').classList.remove('hidden');
    });

  } catch(err) {
    outputBox.textContent = `Error: ${err.message}`;
  } finally {
    generateBtn.disabled = false;
  }
});
