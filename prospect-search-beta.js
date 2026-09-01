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
