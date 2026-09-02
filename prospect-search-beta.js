import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const CONFIG_ENDPOINT =
  "/.netlify/functions/firebase-public-config";

const SEARCH_ENDPOINT =
  "/.netlify/functions/prospect-search";

const ENRICH_ENDPOINT =
  "/.netlify/functions/prospect-enrich";

const QUALIFY_ENDPOINT =
  "/.netlify/functions/prospect-qualify";

const INTELLIGENCE_CACHE_ENDPOINT =
  "/.netlify/functions/prospect-intelligence";

const INTELLIGENCE_BACKGROUND_ENDPOINT =
  "/.netlify/functions/prospect-intelligence-background";

const INTELLIGENCE_STATUS_ENDPOINT =
  "/.netlify/functions/prospect-intelligence-status";

const elements = {
  email:
    document.getElementById("email"),

  password:
    document.getElementById("password"),

  signInButton:
    document.getElementById("sign-in-button"),

  signOutButton:
    document.getElementById("sign-out-button"),

  authStatus:
    document.getElementById("auth-status"),

  searchPanel:
    document.getElementById("search-panel"),

  industry:
    document.getElementById("industry"),

  city:
    document.getElementById("city"),

  state:
    document.getElementById("state"),

  autoEnrichLimit:
    document.getElementById("auto-enrich-limit"),

  searchButton:
    document.getElementById("search-button"),

  searchStatus:
    document.getElementById("search-status"),

  resultsPanel:
    document.getElementById("results-panel"),

  summary:
    document.getElementById("summary"),

  results:
    document.getElementById("results")
};

let auth = null;
let currentUser = null;

function setStatus(
  element,
  message,
  type = ""
) {
  element.textContent =
    message;

  element.classList.remove(
    "success",
    "error"
  );

  if (type) {
    element.classList.add(
      type
    );
  }
}

function setSignedInState(
  user
) {
  currentUser =
    user || null;

  const signedIn =
    Boolean(
      currentUser
    );

  elements.searchPanel
    .classList
    .toggle(
      "hidden",
      !signedIn
    );

  elements.signOutButton
    .classList
    .toggle(
      "hidden",
      !signedIn
    );

  elements.signInButton
    .classList
    .toggle(
      "hidden",
      signedIn
    );

  elements.email.disabled =
    signedIn;

  elements.password.disabled =
    signedIn;

  if (!signedIn) {
    elements.resultsPanel
      .classList
      .add(
        "hidden"
      );
  }
}

async function loadFirebaseConfig() {
  const response =
    await fetch(
      CONFIG_ENDPOINT,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json"
        }
      }
    );

  const payload =
    await response.json();

  if (
    !response.ok ||
    payload.status !==
      "success" ||
    !payload.firebaseConfig
  ) {
    throw new Error(
      payload.error ||
      "Firebase configuration could not be loaded."
    );
  }

  return payload
    .firebaseConfig;
}

function requiredValue(
  element,
  label
) {
  const value =
    element.value
      .trim();

  if (!value) {
    throw new Error(
      `${label} is required.`
    );
  }

  return value;
}

function buildSearchRequest() {
  return {
    industry:
      requiredValue(
        elements.industry,
        "Industry"
      ),

    city:
      requiredValue(
        elements.city,
        "City"
      ),

    state:
      requiredValue(
        elements.state,
        "State"
      )
        .toUpperCase(),

    discoveryLimit:
      10,

    autoEnrichLimit:
      Number(
        elements.autoEnrichLimit
          .value
      )
  };
}

async function authenticatedSearch(
  body
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in."
    );
  }

  const idToken =
    await currentUser
      .getIdToken();

  return fetch(
    SEARCH_ENDPOINT,
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${idToken}`
      },

      body:
        JSON.stringify(
          body
        )
    }
  );
}

async function authenticatedEnrich(
  prospect
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in."
    );
  }

  if (!prospect?.website) {
    throw new Error(
      "This prospect does not have a discovered website to enrich."
    );
  }

  const idToken =
    await currentUser
      .getIdToken();

  const response =
    await fetch(
      ENRICH_ENDPOINT,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${idToken}`
        },

        body:
          JSON.stringify({
            prospectName:
              prospect.prospectName,

            candidateName:
              prospect.candidateName,

            candidateDomain:
              prospect.candidateDomain,

            website:
              prospect.website,

            city:
              elements.city.value
                .trim(),

            state:
              elements.state.value
                .trim()
                .toUpperCase(),

            registryEntity:
              prospect.registry?.entity ||
              null
          })
      }
    );

  const payload =
    await response.json();

  if (
    !response.ok ||
    payload.status !==
      "success"
  ) {
    throw new Error(
      payload.error ||
      "Prospect enrichment failed."
    );
  }

  return payload.enrichment;
}

async function authenticatedQualify(
  prospect,
  qualification
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in."
    );
  }

  const idToken =
    await currentUser
      .getIdToken();

  const response =
    await fetch(
      QUALIFY_ENDPOINT,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${idToken}`
        },

        body:
          JSON.stringify({
            prospect: {
              prospectName:
                prospect.prospectName,

              candidateName:
                prospect.candidateName,

              candidateDomain:
                prospect.candidateDomain,

              website:
                prospect.website,

              registrationId:
                prospect.registry?.entity
                  ?.registrationId ||
                prospect.registry?.entity
                  ?.documentNumber ||
                null
            },

            qualification
          })
      }
    );

  const payload =
    await response.json();

  if (
    !response.ok ||
    payload.status !==
      "success"
  ) {
    throw new Error(
      payload.error ||
      "Prospect qualification failed."
    );
  }

  return payload;
}

function createIdempotencyKey() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID ===
        "function"
  ) {
    return globalThis.crypto
      .randomUUID();
  }

  return [
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2),
    Math.random()
      .toString(36)
      .slice(2)
  ].join("-");
}

function cleanProspectKeyPart(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

function buildFrontendProspectKey(
  prospect
) {
  const registrationId =
    prospect?.registry
      ?.entity
      ?.registrationId ||
    prospect?.registry
      ?.entity
      ?.documentNumber ||
    null;

  if (registrationId) {
    return (
      "registry-" +
      cleanProspectKeyPart(
        registrationId
      )
    );
  }

  if (
    prospect?.candidateDomain
  ) {
    return (
      "domain-" +
      cleanProspectKeyPart(
        prospect.candidateDomain
      )
    );
  }

  const name =
    cleanProspectKeyPart(
      prospect?.prospectName ||
      prospect?.candidateName ||
      "prospect"
    );

  const city =
    cleanProspectKeyPart(
      elements.city.value
    );

  const state =
    cleanProspectKeyPart(
      elements.state.value
    );

  return [
    "prospect",
    name,
    city,
    state
  ]
    .filter(Boolean)
    .join("-");
}

function buildIntelligenceRequest(
  prospect
) {
  return {
    prospectKey:
      buildFrontendProspectKey(
        prospect
      ),

    prospect: {
      prospectName:
        prospect.prospectName ||
        prospect.candidateName ||
        null,

      candidateName:
        prospect.candidateName ||
        null,

      candidateDomain:
        prospect.candidateDomain ||
        null,

      website:
        prospect.website ||
        null,

      location: {
        city:
          elements.city.value
            .trim(),

        state:
          elements.state.value
            .trim()
            .toUpperCase()
      }
    },

    evidence: {
      rankingReasons:
        Array.isArray(
          prospect.rankingReasons
        )
          ? prospect.rankingReasons
          : [],

      registryStatus:
        prospect.registry?.status ||
        null,

      enrichmentStatus:
        prospect.enrichment?.status ||
        null
    },

    salesContext: {
      contextId:
        "general-sales-preparation-v1",

      contextName:
        "General Sales Preparation",

      offering:
        "Sales conversation preparation",

      valueProposition:
        "Help prepare a relevant, evidence-grounded prospect conversation.",

      targetRoles:
        [],

      desiredOutcome:
        "Prepare an informed first conversation",

      preferredOutreachChannel:
        null
    }
  };
}

async function authenticatedIntelligenceCache(
  body,
  idempotencyKey
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in."
    );
  }

  const idToken =
    await currentUser
      .getIdToken();

  return fetch(
    INTELLIGENCE_CACHE_ENDPOINT,
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${idToken}`,

        "Idempotency-Key":
          idempotencyKey
      },

      body:
        JSON.stringify(
          body
        )
    }
  );
}

async function authenticatedIntelligenceBackground(
  body,
  idempotencyKey
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in."
    );
  }

  const idToken =
    await currentUser
      .getIdToken();

  return fetch(
    INTELLIGENCE_BACKGROUND_ENDPOINT,
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${idToken}`,

        "Idempotency-Key":
          idempotencyKey
      },

      body:
        JSON.stringify(
          body
        )
    }
  );
}

async function authenticatedIntelligenceStatus(
  jobId
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in."
    );
  }

  const idToken =
    await currentUser
      .getIdToken();

  return fetch(
    INTELLIGENCE_STATUS_ENDPOINT,
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${idToken}`
      },

      body:
        JSON.stringify({
          jobId
        })
    }
  );
}

function wait(
  milliseconds
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

async function pollIntelligenceJob(
  jobId,
  {
    intervalMs =
      3000,

    maxAttempts =
      25
  } = {}
) {
  for (
    let attempt = 1;
    attempt <=
      maxAttempts;
    attempt += 1
  ) {
    await wait(
      intervalMs
    );

    const response =
      await authenticatedIntelligenceStatus(
        jobId
      );

    const payload =
      await response.json();

    if (
      response.status ===
        404 &&
      attempt <=
        5
    ) {
      continue;
    }

    if (
      response.status ===
        202
    ) {
      continue;
    }

    if (
      response.ok &&
      response.status ===
        200 &&
      payload.status ===
        "success" &&
      payload.brief
    ) {
      return payload;
    }

    throw new Error(
      payload.error ||
      "Prospect intelligence generation failed."
    );
  }

  throw new Error(
    "Prospect intelligence generation did not complete in time."
  );
}

async function buildProspectIntelligence(
  prospect
) {
  const request =
    buildIntelligenceRequest(
      prospect
    );

  const idempotencyKey =
    createIdempotencyKey();

  const cacheResponse =
    await authenticatedIntelligenceCache(
      request,
      idempotencyKey
    );

  const cachePayload =
    await cacheResponse.json();

  if (
    cacheResponse.ok &&
    cacheResponse.status ===
      200 &&
    cachePayload.brief
  ) {
    return cachePayload;
  }

  if (
    cacheResponse.status !==
      404 ||
    cachePayload.status !==
      "miss" ||
    !cachePayload.jobId
  ) {
    throw new Error(
      cachePayload.error ||
      "Prospect intelligence cache check failed."
    );
  }

  const backgroundResponse =
    await authenticatedIntelligenceBackground(
      request,
      idempotencyKey
    );

  if (
    backgroundResponse.status !==
      202
  ) {
    let backgroundPayload =
      null;

    try {
      backgroundPayload =
        await backgroundResponse
          .json();
    } catch {}

    throw new Error(
      backgroundPayload?.error ||
      "Prospect intelligence generation could not be started."
    );
  }

  return pollIntelligenceJob(
    cachePayload.jobId
  );
}

function addSummaryItem(
  label,
  value
) {
  const box =
    document.createElement(
      "div"
    );

  box.className =
    "summary-item";

  const number =
    document.createElement(
      "strong"
    );

  number.textContent =
    String(value);

  const text =
    document.createElement(
      "span"
    );

  text.textContent =
    label;

  box.append(
    number,
    text
  );

  elements.summary
    .appendChild(
      box
    );
}

function addMetaItem(
  container,
  label,
  value
) {
  const box =
    document.createElement(
      "div"
    );

  box.className =
    "meta-item";

  const heading =
    document.createElement(
      "strong"
    );

  heading.textContent =
    label;

  const content =
    document.createElement(
      "span"
    );

  content.textContent =
    value === null ||
    value === undefined ||
    value === ""
      ? "—"
      : String(value);

  box.append(
    heading,
    content
  );

  container.appendChild(
    box
  );

  return content;
}

function renderContactValues(
  container,
  label,
  observations
) {
  const box =
    document.createElement(
      "div"
    );

  box.className =
    "contact-box";

  const heading =
    document.createElement(
      "strong"
    );

  heading.textContent =
    label;

  box.appendChild(
    heading
  );

  const values =
    Array.isArray(
      observations
    )
      ? observations
      : [];

  if (
    values.length === 0
  ) {
    const empty =
      document.createElement(
        "span"
      );

    empty.className =
      "contact-value";

    empty.textContent =
      "Not observed";

    box.appendChild(
      empty
    );
  } else {
    for (
      const observation
      of values
    ) {
      const line =
        document.createElement(
          "span"
        );

      line.className =
        "contact-value";

      line.textContent =
        observation?.value ||
        String(
          observation
        );

      box.appendChild(
        line
      );
    }
  }

  container.appendChild(
    box
  );
}

function appendIntelligenceList(
  container,
  headingText,
  items
) {
  const values =
    Array.isArray(
      items
    )
      ? items.filter(Boolean)
      : [];

  if (
    values.length === 0
  ) {
    return;
  }

  const section =
    document.createElement(
      "section"
    );

  section.style.display =
    "grid";

  section.style.gap =
    "8px";

  const heading =
    document.createElement(
      "strong"
    );

  heading.textContent =
    headingText;

  const list =
    document.createElement(
      "ul"
    );

  list.className =
    "reasons";

  for (
    const value
    of values
  ) {
    const item =
      document.createElement(
        "li"
      );

    item.textContent =
      typeof value ===
        "string"
        ? value
        : value?.statement ||
          JSON.stringify(
            value
          );

    list.appendChild(
      item
    );
  }

  section.append(
    heading,
    list
  );

  container.appendChild(
    section
  );
}

function renderProspect(
  prospect,
  rank
) {
  const card =
    document.createElement(
      "article"
    );

  card.className =
    "prospect-card";

  const top =
    document.createElement(
      "div"
    );

  top.className =
    "prospect-top";

  const titleArea =
    document.createElement(
      "div"
    );

  const title =
    document.createElement(
      "h3"
    );

  title.textContent =
    `${rank}. ${
      prospect.prospectName ||
      "Prospect"
    }`;

  const domain =
    document.createElement(
      "div"
    );

  domain.className =
    "domain";

  domain.textContent =
    prospect.candidateDomain ||
    "No domain";

  titleArea.append(
    title,
    domain
  );

  const score =
    document.createElement(
      "div"
    );

  score.className =
    "score";

  const scoreValue =
    document.createElement(
      "strong"
    );

  scoreValue.textContent =
    String(
      prospect.priorityScore ??
      "—"
    );

  const scoreLabel =
    document.createElement(
      "span"
    );

  scoreLabel.textContent =
    "Priority";

  score.append(
    scoreValue,
    scoreLabel
  );

  top.append(
    titleArea,
    score
  );

  card.appendChild(
    top
  );

  const meta =
    document.createElement(
      "div"
    );

  meta.className =
    "meta";

  addMetaItem(
    meta,
    "Registry",
    prospect.registry?.status
  );

  const enrichmentStatusValue =
    addMetaItem(
      meta,
      "Enrichment",
      prospect.enrichment?.status
    );

  addMetaItem(
    meta,
    "Discovery",
    prospect.discovery?.confidence
  );

  const websiteBox =
    document.createElement(
      "div"
    );

  websiteBox.className =
    "meta-item";

  const websiteHeading =
    document.createElement(
      "strong"
    );

  websiteHeading.textContent =
    "Website";

  const websiteLink =
    document.createElement(
      "a"
    );

  websiteLink.className =
    "website-link";

  websiteLink.target =
    "_blank";

  websiteLink.rel =
    "noopener noreferrer";

  websiteLink.href =
    prospect.website ||
    "#";

  websiteLink.textContent =
    prospect.website ||
    "—";

  websiteBox.append(
    websiteHeading,
    websiteLink
  );

  meta.appendChild(
    websiteBox
  );

  card.appendChild(
    meta
  );

  const reasons =
    Array.isArray(
      prospect.rankingReasons
    )
      ? prospect.rankingReasons
      : [];

  if (
    reasons.length > 0
  ) {
    const list =
      document.createElement(
        "ul"
      );

    list.className =
      "reasons";

    for (
      const reason
      of reasons
    ) {
      const item =
        document.createElement(
          "li"
        );

      item.textContent =
        reason;

      list.appendChild(
        item
      );
    }

    card.appendChild(
      list
    );
  }

  let contacts =
    null;

  function renderEnrichmentContacts(
    enrichmentData
  ) {
    if (contacts) {
      contacts.remove();
      contacts = null;
    }

    if (!enrichmentData) {
      return;
    }

    contacts =
      document.createElement(
        "div"
      );

    contacts.className =
      "contact-grid";

    renderContactValues(
      contacts,
      "Observed Emails",
      enrichmentData.emails
    );

    renderContactValues(
      contacts,
      "Observed Phones",
      enrichmentData.phones
    );

    card.appendChild(
      contacts
    );
  }

  renderEnrichmentContacts(
    prospect.enrichment?.data
  );

  const cardActions =
    document.createElement(
      "div"
    );

  cardActions.className =
    "actions";

  const enrichButton =
    document.createElement(
      "button"
    );

  enrichButton.type =
    "button";

  enrichButton.className =
    "secondary";

  const alreadyEnriched =
    prospect.enrichment?.status &&
    prospect.enrichment.status !==
      "not_attempted";

  enrichButton.textContent =
    alreadyEnriched
      ? "ENRICHED"
      : "ENRICH";

  enrichButton.disabled =
    Boolean(
      alreadyEnriched
    );

  enrichButton.addEventListener(
    "click",
    async () => {
      enrichButton.disabled =
        true;

      enrichButton.textContent =
        "ENRICHING…";

      enrichmentStatusValue.textContent =
        "in_progress";

      try {
        const enrichment =
          await authenticatedEnrich(
            prospect
          );

        prospect.enrichment = {
          status:
            enrichment.enrichmentStatus ||
            "complete",

          data:
            enrichment
        };

        enrichmentStatusValue.textContent =
          prospect.enrichment.status;

        renderEnrichmentContacts(
          enrichment
        );

        enrichButton.textContent =
          "ENRICHED";

      } catch (error) {
        prospect.enrichment = {
          status:
            "failed",

          error:
            error.message
        };

        enrichmentStatusValue.textContent =
          "failed";

        enrichButton.textContent =
          "RETRY ENRICH";

        enrichButton.disabled =
          false;
      }
    }
  );

  cardActions.appendChild(
    enrichButton
  );

  const qualifyButton =
    document.createElement(
      "button"
    );

  qualifyButton.type =
    "button";

  qualifyButton.className =
    "secondary";

  qualifyButton.textContent =
    prospect.customerState
      ? "QUALIFIED"
      : "QUALIFY";

  cardActions.appendChild(
    qualifyButton
  );

  const intelligenceButton =
    document.createElement(
      "button"
    );

  intelligenceButton.type =
    "button";

  intelligenceButton.className =
    "secondary";

  intelligenceButton.textContent =
    prospect.intelligence?.brief
      ? "INTELLIGENCE READY"
      : "BUILD INTELLIGENCE BRIEF";

  cardActions.appendChild(
    intelligenceButton
  );

  let intelligenceStatusBox =
    null;

  function renderIntelligenceStatus(
    message,
    type = ""
  ) {
    if (
      intelligenceStatusBox
    ) {
      intelligenceStatusBox
        .remove();

      intelligenceStatusBox =
        null;
    }

    if (!message) {
      return;
    }

    intelligenceStatusBox =
      document.createElement(
        "div"
      );

    intelligenceStatusBox
      .className =
        "meta";

    const statusValue =
      addMetaItem(
        intelligenceStatusBox,
        "Intelligence",
        message
      );

    if (
      type ===
        "error"
    ) {
      statusValue.style.color =
        "#ff9b9b";
    }

    if (
      type ===
        "success"
    ) {
      statusValue.style.color =
        "#7ee7b7";
    }

    if (
      cardActions.parentNode ===
        card
    ) {
      card.insertBefore(
        intelligenceStatusBox,
        cardActions
      );
    } else {
      card.appendChild(
        intelligenceStatusBox
      );
    }
  }

  let intelligenceBriefBox =
    null;

  function renderIntelligenceBrief(
    brief,
    sources = []
  ) {
    if (
      intelligenceBriefBox
    ) {
      intelligenceBriefBox
        .remove();

      intelligenceBriefBox =
        null;
    }

    if (
      !brief ||
      typeof brief !==
        "object"
    ) {
      return;
    }

    intelligenceBriefBox =
      document.createElement(
        "div"
      );

    intelligenceBriefBox.style.display =
      "grid";

    intelligenceBriefBox.style.gap =
      "16px";

    intelligenceBriefBox.style.padding =
      "18px";

    intelligenceBriefBox.style.marginTop =
      "14px";

    intelligenceBriefBox.style.border =
      "1px solid rgba(255,255,255,0.12)";

    intelligenceBriefBox.style.borderRadius =
      "14px";

    intelligenceBriefBox.style.background =
      "rgba(255,255,255,0.03)";

    const heading =
      document.createElement(
        "h4"
      );

    heading.textContent =
      "Prospect Intelligence Brief";

    heading.style.margin =
      "0";

    intelligenceBriefBox.appendChild(
      heading
    );

    const factualContext =
      brief.factualContext ||
      {};

    const salesAnalysis =
      brief.salesAnalysis ||
      {};

    if (
      factualContext.companySummary
    ) {
      const summarySection =
        document.createElement(
          "section"
        );

      summarySection.style.display =
        "grid";

      summarySection.style.gap =
        "8px";

      const summaryHeading =
        document.createElement(
          "strong"
        );

      summaryHeading.textContent =
        "Company Context";

      const summaryText =
        document.createElement(
          "p"
        );

      summaryText.textContent =
        factualContext.companySummary;

      summaryText.style.margin =
        "0";

      summarySection.append(
        summaryHeading,
        summaryText
      );

      intelligenceBriefBox
        .appendChild(
          summarySection
        );
    }

    appendIntelligenceList(
      intelligenceBriefBox,
      "Company Facts",
      factualContext.companyFacts
    );

    appendIntelligenceList(
      intelligenceBriefBox,
      "Current Developments",
      factualContext.currentDevelopments
    );

    appendIntelligenceList(
      intelligenceBriefBox,
      "Conversation Starters",
      factualContext.conversationStarters
    );

    appendIntelligenceList(
      intelligenceBriefBox,
      "Sales Relevance",
      salesAnalysis.salesRelevance
    );

    const hypotheses =
      Array.isArray(
        salesAnalysis.needHypotheses
      )
        ? salesAnalysis.needHypotheses
        : [];

    if (
      hypotheses.length > 0
    ) {
      const hypothesisSection =
        document.createElement(
          "section"
        );

      hypothesisSection.style.display =
        "grid";

      hypothesisSection.style.gap =
        "8px";

      const hypothesisHeading =
        document.createElement(
          "strong"
        );

      hypothesisHeading.textContent =
        "Need Hypotheses";

      hypothesisSection.appendChild(
        hypothesisHeading
      );

      for (
        const hypothesis
        of hypotheses
      ) {
        const box =
          document.createElement(
            "div"
          );

        box.style.display =
          "grid";

        box.style.gap =
          "5px";

        const statement =
          document.createElement(
            "span"
          );

        statement.textContent =
          hypothesis?.statement ||
          "Hypothesis";

        box.appendChild(
          statement
        );

        if (
          hypothesis?.confidence
        ) {
          const confidence =
            document.createElement(
              "small"
            );

          confidence.textContent =
            `Confidence: ${hypothesis.confidence}`;

          box.appendChild(
            confidence
          );
        }

        const basis =
          Array.isArray(
            hypothesis?.basis
          )
            ? hypothesis.basis
            : [];

        if (
          basis.length > 0
        ) {
          const basisText =
            document.createElement(
              "small"
            );

          basisText.textContent =
            `Basis: ${basis.join("; ")}`;

          box.appendChild(
            basisText
          );
        }

        hypothesisSection
          .appendChild(
            box
          );
      }

      intelligenceBriefBox
        .appendChild(
          hypothesisSection
        );
    }

    appendIntelligenceList(
      intelligenceBriefBox,
      "Discovery Questions",
      salesAnalysis.discoveryQuestions
    );

    appendIntelligenceList(
      intelligenceBriefBox,
      "Objection Preparation",
      salesAnalysis.objectionPreparation
    );

    if (
      salesAnalysis.recommendedApproach
    ) {
      const approachSection =
        document.createElement(
          "section"
        );

      approachSection.style.display =
        "grid";

      approachSection.style.gap =
        "8px";

      const approachHeading =
        document.createElement(
          "strong"
        );

      approachHeading.textContent =
        "Recommended Approach";

      const approachText =
        document.createElement(
          "p"
        );

      approachText.textContent =
        salesAnalysis
          .recommendedApproach;

      approachText.style.margin =
        "0";

      approachSection.append(
        approachHeading,
        approachText
      );

      intelligenceBriefBox
        .appendChild(
          approachSection
        );
    }

    if (
      salesAnalysis.outreachIdea
    ) {
      const outreachSection =
        document.createElement(
          "section"
        );

      outreachSection.style.display =
        "grid";

      outreachSection.style.gap =
        "8px";

      const outreachHeading =
        document.createElement(
          "strong"
        );

      outreachHeading.textContent =
        "Outreach Idea";

      const outreachText =
        document.createElement(
          "p"
        );

      outreachText.textContent =
        salesAnalysis.outreachIdea;

      outreachText.style.margin =
        "0";

      outreachSection.append(
        outreachHeading,
        outreachText
      );

      intelligenceBriefBox
        .appendChild(
          outreachSection
        );
    }

    const sourceList =
      Array.isArray(
        sources
      ) &&
      sources.length > 0
        ? sources
        : Array.isArray(
            brief.sources
          )
          ? brief.sources
          : [];

    if (
      sourceList.length > 0
    ) {
      const sourceSection =
        document.createElement(
          "section"
        );

      sourceSection.style.display =
        "grid";

      sourceSection.style.gap =
        "8px";

      const sourceHeading =
        document.createElement(
          "strong"
        );

      sourceHeading.textContent =
        "Sources";

      sourceSection.appendChild(
        sourceHeading
      );

      const sourceListElement =
        document.createElement(
          "ul"
        );

      sourceListElement.className =
        "reasons";

      for (
        const source
        of sourceList
      ) {
        const item =
          document.createElement(
            "li"
          );

        const sourceTitle =
          source?.title ||
          source?.domain ||
          source?.url ||
          "Source";

        if (
          typeof source?.url ===
            "string" &&
          /^https?:\/\//i.test(
            source.url
          )
        ) {
          const link =
            document.createElement(
              "a"
            );

          link.href =
            source.url;

          link.target =
            "_blank";

          link.rel =
            "noopener noreferrer";

          link.textContent =
            sourceTitle;

          item.appendChild(
            link
          );
        } else {
          item.textContent =
            sourceTitle;
        }

        sourceListElement
          .appendChild(
            item
          );
      }

      sourceSection.appendChild(
        sourceListElement
      );

      intelligenceBriefBox
        .appendChild(
          sourceSection
        );
    }

    if (
      cardActions.parentNode ===
        card
    ) {
      card.insertBefore(
        intelligenceBriefBox,
        cardActions
      );
    } else {
      card.appendChild(
        intelligenceBriefBox
      );
    }
  }

  if (
    prospect.intelligence?.brief
  ) {
    renderIntelligenceStatus(
      "Brief ready",
      "success"
    );

    renderIntelligenceBrief(
      prospect.intelligence.brief,
      prospect.intelligence.sources
    );
  }

  intelligenceButton
    .addEventListener(
      "click",
      async () => {
        intelligenceButton.disabled =
          true;

        intelligenceButton.textContent =
          "BUILDING INTELLIGENCE…";

        renderIntelligenceStatus(
          "Building intelligence…"
        );

        try {
          const result =
            await buildProspectIntelligence(
              prospect
            );

          prospect.intelligence = {
            brief:
              result.brief,

            sources:
              Array.isArray(
                result.sources
              )
                ? result.sources
                : [],

            cached:
              Boolean(
                result.cached
              )
          };

          intelligenceButton.textContent =
            "INTELLIGENCE READY";

          renderIntelligenceStatus(
            result.cached
              ? "Brief ready from cache"
              : "Brief ready",
            "success"
          );

          renderIntelligenceBrief(
            prospect.intelligence.brief,
            prospect.intelligence.sources
          );

        } catch (error) {
          intelligenceButton.disabled =
            false;

          intelligenceButton.textContent =
            "RETRY INTELLIGENCE";

          renderIntelligenceStatus(
            error.message ||
            "Prospect intelligence generation failed.",
            "error"
          );
        }
      }
    );

  let customerStateBox =
    null;

  function renderCustomerState(
    customerState
  ) {
    if (customerStateBox) {
      customerStateBox.remove();
      customerStateBox = null;
    }

    if (
      !customerState ||
      !customerState.salesState
    ) {
      return;
    }

    customerStateBox =
      document.createElement(
        "div"
      );

    customerStateBox.className =
      "meta";

    addMetaItem(
      customerStateBox,
      "Customer Status",
      customerState.salesState
        .status
    );

    addMetaItem(
      customerStateBox,
      "Customer Priority",
      customerState.salesState
        .priority
    );

    addMetaItem(
      customerStateBox,
      "Est. Value",
      customerState.salesState
        .estimatedValue === null ||
      customerState.salesState
        .estimatedValue === undefined
        ? "—"
        : `$${Number(
            customerState.salesState
              .estimatedValue
          ).toLocaleString()}`
    );

    addMetaItem(
      customerStateBox,
      "Follow-up",
      customerState.salesState
        .followUpDate
    );

    if (
      cardActions.parentNode ===
      card
    ) {
      card.insertBefore(
        customerStateBox,
        cardActions
      );
    } else {
      card.appendChild(
        customerStateBox
      );
    }
  }

  renderCustomerState(
    prospect.customerState
  );

  qualifyButton.addEventListener(
    "click",
    () => {
      const overlay =
        document.createElement(
          "div"
        );

      overlay.style.position =
        "fixed";

      overlay.style.inset =
        "0";

      overlay.style.background =
        "rgba(0, 0, 0, 0.72)";

      overlay.style.display =
        "flex";

      overlay.style.alignItems =
        "center";

      overlay.style.justifyContent =
        "center";

      overlay.style.zIndex =
        "9999";

      overlay.style.padding =
        "20px";

      const modal =
        document.createElement(
          "div"
        );

      modal.style.width =
        "min(680px, 100%)";

      modal.style.maxHeight =
        "90vh";

      modal.style.overflow =
        "auto";

      modal.style.background =
        "#08111f";

      modal.style.border =
        "1px solid rgba(255,255,255,0.15)";

      modal.style.borderRadius =
        "16px";

      modal.style.padding =
        "24px";

      const heading =
        document.createElement(
          "h3"
        );

      heading.textContent =
        `Qualify ${
          prospect.prospectName ||
          "Prospect"
        }`;

      modal.appendChild(
        heading
      );

      const form =
        document.createElement(
          "form"
        );

      form.style.display =
        "grid";

      form.style.gap =
        "14px";

      const existing =
        prospect.customerState
          ?.salesState ||
        {};

      function makeField(
        labelText,
        type,
        name,
        value = ""
      ) {
        const wrapper =
          document.createElement(
            "label"
          );

        wrapper.style.display =
          "grid";

        wrapper.style.gap =
          "6px";

        const label =
          document.createElement(
            "span"
          );

        label.textContent =
          labelText;

        const input =
          document.createElement(
            "input"
          );

        input.type =
          type;

        input.name =
          name;

        input.value =
          value ?? "";

        input.style.width =
          "100%";

        wrapper.append(
          label,
          input
        );

        return {
          wrapper,
          input
        };
      }

      function makeSelect(
        labelText,
        name,
        options,
        selectedValue
      ) {
        const wrapper =
          document.createElement(
            "label"
          );

        wrapper.style.display =
          "grid";

        wrapper.style.gap =
          "6px";

        const label =
          document.createElement(
            "span"
          );

        label.textContent =
          labelText;

        const select =
          document.createElement(
            "select"
          );

        select.name =
          name;

        for (
          const optionValue
          of options
        ) {
          const option =
            document.createElement(
              "option"
            );

          option.value =
            optionValue;

          option.textContent =
            optionValue;

          if (
            optionValue ===
            selectedValue
          ) {
            option.selected =
              true;
          }

          select.appendChild(
            option
          );
        }

        wrapper.append(
          label,
          select
        );

        return {
          wrapper,
          select
        };
      }

      const statusField =
        makeSelect(
          "Status",
          "status",
          [
            "NEW",
            "QUALIFIED",
            "CONTACTED",
            "FOLLOW_UP",
            "WON",
            "LOST"
          ],
          existing.status ||
          "QUALIFIED"
        );

      const priorityField =
        makeSelect(
          "Priority",
          "priority",
          [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
          ],
          existing.priority ||
          "MEDIUM"
        );

      const valueField =
        makeField(
          "Estimated Value",
          "number",
          "estimatedValue",
          existing.estimatedValue ??
          ""
        );

      valueField.input.min =
        "0";

      valueField.input.step =
        "0.01";

      const timingField =
        makeField(
          "Timing",
          "text",
          "timing",
          existing.timing ||
          ""
        );

      const nextActionField =
        makeField(
          "Next Action",
          "text",
          "nextAction",
          existing.nextAction ||
          ""
        );

      const followUpField =
        makeField(
          "Follow-up Date",
          "date",
          "followUpDate",
          existing.followUpDate ||
          ""
        );

      const contactNameField =
        makeField(
          "Contact Name",
          "text",
          "contactName",
          existing.contactName ||
          ""
        );

      const contactRoleField =
        makeField(
          "Contact Role",
          "text",
          "contactRole",
          existing.contactRole ||
          ""
        );

      const notesWrapper =
        document.createElement(
          "label"
        );

      notesWrapper.style.display =
        "grid";

      notesWrapper.style.gap =
        "6px";

      const notesLabel =
        document.createElement(
          "span"
        );

      notesLabel.textContent =
        "Notes";

      const notes =
        document.createElement(
          "textarea"
        );

      notes.name =
        "notes";

      notes.rows =
        4;

      notes.value =
        existing.notes ||
        "";

      notesWrapper.append(
        notesLabel,
        notes
      );

      form.append(
        statusField.wrapper,
        priorityField.wrapper,
        valueField.wrapper,
        timingField.wrapper,
        nextActionField.wrapper,
        followUpField.wrapper,
        contactNameField.wrapper,
        contactRoleField.wrapper,
        notesWrapper
      );

      const modalActions =
        document.createElement(
          "div"
        );

      modalActions.className =
        "actions";

      const cancelButton =
        document.createElement(
          "button"
        );

      cancelButton.type =
        "button";

      cancelButton.className =
        "secondary";

      cancelButton.textContent =
        "CANCEL";

      const saveButton =
        document.createElement(
          "button"
        );

      saveButton.type =
        "submit";

      saveButton.textContent =
        "SAVE QUALIFICATION";

      modalActions.append(
        cancelButton,
        saveButton
      );

      form.appendChild(
        modalActions
      );

      modal.appendChild(
        form
      );

      overlay.appendChild(
        modal
      );

      document.body
        .appendChild(
          overlay
        );

      cancelButton.addEventListener(
        "click",
        () =>
          overlay.remove()
      );

      overlay.addEventListener(
        "click",
        event => {
          if (
            event.target ===
            overlay
          ) {
            overlay.remove();
          }
        }
      );

      form.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          saveButton.disabled =
            true;

          saveButton.textContent =
            "SAVING…";

          try {
            const result =
              await authenticatedQualify(
                prospect,
                {
                  status:
                    statusField.select
                      .value,

                  priority:
                    priorityField.select
                      .value,

                  estimatedValue:
                    valueField.input
                      .value === ""
                      ? null
                      : Number(
                          valueField.input
                            .value
                        ),

                  timing:
                    timingField.input
                      .value,

                  nextAction:
                    nextActionField.input
                      .value,

                  followUpDate:
                    followUpField.input
                      .value,

                  contactName:
                    contactNameField.input
                      .value,

                  contactRole:
                    contactRoleField.input
                      .value,

                  notes:
                    notes.value
                }
              );

            prospect.customerState =
              result.customerState;

            renderCustomerState(
              prospect.customerState
            );

            qualifyButton.textContent =
              "QUALIFIED";

            overlay.remove();

          } catch (error) {
            saveButton.disabled =
              false;

            saveButton.textContent =
              "SAVE QUALIFICATION";

            alert(
              error.message
            );
          }
        }
      );
    }
  );

  card.appendChild(
    cardActions
  );

  elements.results
    .appendChild(
      card
    );
}

function renderResults(
  payload
) {
  elements.summary
    .replaceChildren();

  elements.results
    .replaceChildren();

  addSummaryItem(
    "Discovered",
    payload.discoveredCount ?? 0
  );

  addSummaryItem(
    "Prospects",
    payload.prospectCount ?? 0
  );

  addSummaryItem(
    "Excluded Sources",
    payload.excludedCount ?? 0
  );

  addSummaryItem(
    "Enriched",
    payload.enrichedCount ?? 0
  );

  const prospects =
    Array.isArray(
      payload.prospects
    )
      ? payload.prospects
      : [];

  for (
    let index = 0;
    index < prospects.length;
    index++
  ) {
    renderProspect(
      prospects[index],
      index + 1
    );
  }

  elements.resultsPanel
    .classList
    .remove(
      "hidden"
    );
}

async function runSearch() {
  elements.searchButton.disabled =
    true;

  setStatus(
    elements.searchStatus,
    "Discovering and ranking prospects…"
  );

  try {
    const body =
      buildSearchRequest();

    const response =
      await authenticatedSearch(
        body
      );

    const payload =
      await response.json();

    if (
      !response.ok ||
      payload.status !==
        "success"
    ) {
      throw new Error(
        payload.error ||
        "Prospect search failed."
      );
    }

    renderResults(
      payload
    );

    setStatus(
      elements.searchStatus,
      `Found ${payload.prospectCount || 0} ranked prospects.`,
      "success"
    );

  } catch (error) {
    setStatus(
      elements.searchStatus,
      error.message ||
      "Prospect search failed.",
      "error"
    );

  } finally {
    elements.searchButton.disabled =
      false;
  }
}

async function initialize() {
  try {
    const firebaseConfig =
      await loadFirebaseConfig();

    const app =
      initializeApp(
        firebaseConfig
      );

    auth =
      getAuth(
        app
      );

    onAuthStateChanged(
      auth,
      user => {
        setSignedInState(
          user
        );

        if (user) {
          setStatus(
            elements.authStatus,
            `Signed in as ${user.email || "authenticated user"}.`,
            "success"
          );
        } else {
          setStatus(
            elements.authStatus,
            "Sign in to search prospects."
          );
        }
      }
    );

    elements.signInButton
      .addEventListener(
        "click",
        async () => {
          elements.signInButton.disabled =
            true;

          try {
            const email =
              requiredValue(
                elements.email,
                "Email"
              );

            const password =
              requiredValue(
                elements.password,
                "Password"
              );

            await signInWithEmailAndPassword(
              auth,
              email,
              password
            );

          } catch (error) {
            setStatus(
              elements.authStatus,
              error.message ||
              "Sign in failed.",
              "error"
            );

          } finally {
            elements.signInButton.disabled =
              false;
          }
        }
      );

    elements.signOutButton
      .addEventListener(
        "click",
        async () => {
          await signOut(
            auth
          );
        }
      );

    elements.searchButton
      .addEventListener(
        "click",
        runSearch
      );

  } catch (error) {
    setStatus(
      elements.authStatus,
      error.message ||
      "Prospect Search could not initialize.",
      "error"
    );
  }
}

initialize();
