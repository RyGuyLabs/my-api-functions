// Helper: Highlight text briefly
function highlightText(element) {
  if (!element) return;
  element.style.transition = 'background-color 0.5s';
  element.style.backgroundColor = '#facc15'; // yellow highlight
  setTimeout(()=>{ element.style.backgroundColor = ''; }, 1200);
}

// Generate Idea Button
generateIdeaBtn.addEventListener('click', async ()=>{
  const name = leadNameInput.value.trim();
  const company = companyInput.value.trim();
  const purpose = purposeOfContactInput.value.trim();
  const status = leadStatusSelect?.value || 'Prospect'; // optional select for lead status

  if (!name || !company || !purpose) {
    showNotification("Please fill out Lead Name, Company, and Purpose of Contact to generate a tailored idea.", true);
    return;
  }

  generateIdeaBtn.disabled = true;
  btnText.classList.add('hidden');
  loadingSpinner.classList.remove('hidden');
  ideaOutput.classList.add('hidden');

  try {
    const text = await postToAPI('lead_idea', { name, company, purpose, status });
    ideaText.textContent = text;
    ideaOutput.classList.remove('hidden');
    highlightText(ideaText);
  } catch(e) {
    console.error(e);
    ideaText.textContent = `Error: ${e.message}`;
    ideaOutput.classList.remove('hidden');
  } finally {
    generateIdeaBtn.disabled = false;
    btnText.classList.remove('hidden');
    loadingSpinner.classList.add('hidden');
  }
});

// Generate Nurturing Note Button
nurturingNoteBtn.addEventListener('click', async ()=>{
  const name = leadNameInput.value.trim();
  const company = companyInput.value.trim();
  const purpose = purposeOfContactInput.value.trim();
  const status = leadStatusSelect?.value || 'Prospect';

  if (!name || !company || !purpose) {
    showNotification("Please fill out Lead Name, Company, and Purpose to generate a message.", true);
    return;
  }

  nurturingNoteBtn.disabled = true;
  nurturingBtnText.classList.add('hidden');
  nurturingLoadingSpinner.classList.remove('hidden');
  nurturingNoteOutput.classList.add('hidden');

  try {
    const text = await postToAPI('nurturing_note', { name, company, purpose, status });
    nurturingNoteText.textContent = text;
    nurturingNoteOutput.classList.remove('hidden');
    highlightText(nurturingNoteText);
  } catch(e) {
    console.error(e);
    nurturingNoteText.textContent = `Error: ${e.message}`;
    nurturingNoteOutput.classList.remove('hidden');
  } finally {
    nurturingNoteBtn.disabled = false;
    nurturingBtnText.classList.remove('hidden');
    nurturingLoadingSpinner.classList.add('hidden');
  }
});
