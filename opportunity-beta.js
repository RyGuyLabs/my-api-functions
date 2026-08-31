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

const OPPORTUNITY_ENDPOINT =
  "/.netlify/functions/opportunity-preview";

const elements = {
  authPanel:
    document.getElementById("auth-panel"),

  opportunityPanel:
    document.getElementById("opportunity-panel"),

  resultsPanel:
    document.getElementById("results-panel"),

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

  runPreviewButton:
    document.getElementById("run-preview-button"),

  downloadCsvButton:
    document.getElementById("download-csv-button"),

  previewStatus:
    document.getElementById("preview-status"),

  results:
    document.getElementById("results"),

  registrationId:
    document.getElementById("registration-id"),

  companyName:
    document.getElementById("company-name"),

  beforeStatus:
    document.getElementById("before-status"),

  afterStatus:
    document.getElementById("after-status"),

  city:
    document.getElementById("city"),

  state:
    document.getElementById("state"),

  entityType:
    document.getElementById("entity-type"),

  classificationCode:
    document.getElementById("classification-code"),

  profileId:
    document.getElementById("profile-id"),

  maxSignalAge:
    document.getElementById("max-signal-age")
};

let auth = null;
let currentUser = null;
let lastSuccessfulPayload = null;

function setStatus(
  element,
  message,
  type = ""
) {
  element.textContent =
    message;

  element.classList.remove(
    "error",
    "success"
  );

  if (type) {
    element.classList.add(type);
  }
}

function setSignedInState(user) {
  currentUser =
    user || null;

  const signedIn =
    Boolean(currentUser);

  elements.opportunityPanel
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
      .add("hidden");

    elements.downloadCsvButton.disabled =
      true;

    lastSuccessfulPayload =
      null;
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

  let payload = null;

  try {
    payload =
      await response.json();
  } catch {
    throw new Error(
      "Firebase configuration response was invalid."
    );
  }

  if (
    !response.ok ||
    payload.status !== "success" ||
    !payload.firebaseConfig
  ) {
    throw new Error(
      payload.error ||
      "Firebase browser configuration could not be loaded."
    );
  }

  return payload.firebaseConfig;
}

function nonEmptyValue(
  element,
  label
) {
  const value =
    element.value.trim();

  if (!value) {
    throw new Error(
      `${label} is required.`
    );
  }

  return value;
}

function buildOpportunityRequest(
  format = "json"
) {
  const registrationId =
    nonEmptyValue(
      elements.registrationId,
      "Registration ID"
    );

  const companyName =
    nonEmptyValue(
      elements.companyName,
      "Company"
    );

  const city =
    nonEmptyValue(
      elements.city,
      "City"
    );

  const state =
    nonEmptyValue(
      elements.state,
      "State"
    ).toUpperCase();

  const entityType =
    nonEmptyValue(
      elements.entityType,
      "Entity Type"
    );

  const classificationCode =
    nonEmptyValue(
      elements.classificationCode,
      "Industry classification"
    );

  const profileId =
    nonEmptyValue(
      elements.profileId,
      "Customer Profile ID"
    );

  const maxSignalAgeHours =
    Number(
      elements.maxSignalAge.value
    );

  if (
    !Number.isFinite(
      maxSignalAgeHours
    ) ||
    maxSignalAgeHours < 0
  ) {
    throw new Error(
      "Maximum Signal Age must be a non-negative number."
    );
  }

  const detectedAt =
    new Date().toISOString();

  const entityFields = {
    registration_id:
      registrationId,

    company_name:
      companyName,

    entity_type:
      entityType,

    principal_address_line1:
      null,

    principal_address_line2:
      null,

    principal_city:
      city,

    principal_state:
      state,

    principal_zip:
      null,

    mailing_address_line1:
      null,

    mailing_address_line2:
      null,

    mailing_city:
      city,

    mailing_state:
      state,

    mailing_zip:
      null,

    registered_agent_name:
      null
  };

  return {
    before: {
      ...entityFields,
      status:
        elements.beforeStatus.value
    },

    after: {
      ...entityFields,
      status:
        elements.afterStatus.value
    },

    entityContext: {
      classificationCode,

      entityType,

      location: {
        state,
        city
      }
    },

    customerProfile: {
      profileId,

      geography: {
        states: [
          state
        ],

        cities: [
          city
        ],

        counties: [],

        zips: []
      },

      industryClassifications: [
        classificationCode
      ],

      entityTypes: [
        entityType
      ],

      targetCommercialEventTypes: [
        "ENTITY_ACTIVATION"
      ],

      maxSignalAgeHours
    },

    lead: {
      prospectId:
        `prospect_${registrationId}`,

      prospectName:
        companyName,

      location: {
        state,
        city
      },

      locationDisplay:
        `${city}, ${state}`,

      entity: {
        registrationId,

        companyName,

        status:
          elements.afterStatus.value,

        entityType,

        classificationCode
      },

      score:
        null,

      priority:
        "UNQUALIFIED",

      qualificationReasons: [
        "Controlled beta simulation; QualificationEngine was not executed."
      ],

      salesSignals: [],

      recommendedAction:
        "Validate the trigger against authoritative source data before outreach.",

      evidenceSummary: [
        "Controlled beta simulation input; not authoritative registry evidence."
      ]
    },

    detectedAt,

    asOf:
      detectedAt,

    sourceType:
      "controlled_beta_preview",

    sourceReference: {
      state,
      registrationId
    },

    evidenceHash:
      null,

    format
  };
}

async function authenticatedRequest(
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
    OPPORTUNITY_ENDPOINT,
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
        JSON.stringify(body)
    }
  );
}

function addMetaItem(
  container,
  label,
  value
) {
  const item =
    document.createElement(
      "div"
    );

  item.className =
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

  item.append(
    heading,
    content
  );

  container.appendChild(
    item
  );
}

function renderOpportunities(
  opportunities
) {
  elements.results
    .replaceChildren();

  if (
    !Array.isArray(opportunities) ||
    opportunities.length === 0
  ) {
    elements.resultsPanel
      .classList
      .remove("hidden");

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "status";

    empty.textContent =
      "No opportunities matched this customer profile and trigger.";

    elements.results
      .appendChild(empty);

    return;
  }

  for (
    const opportunity
    of opportunities
  ) {
    const card =
      document.createElement(
        "article"
      );

    card.className =
      "opportunity-card";

    const title =
      document.createElement(
        "h3"
      );

    title.textContent =
      opportunity.prospectName ||
      "Opportunity";

    const trigger =
      document.createElement(
        "div"
      );

    trigger.className =
      "eyebrow";

    trigger.textContent =
      opportunity.commercialEventType ||
      "COMMERCIAL OPPORTUNITY";

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "meta";

    addMetaItem(
      meta,
      "Registration ID",
      opportunity.entityId
    );

    addMetaItem(
      meta,
      "Trigger Reason",
      opportunity.commercialReasonCode
    );

    addMetaItem(
      meta,
      "Signal Age",
      opportunity.signalAgeHours === null ||
      opportunity.signalAgeHours === undefined
        ? "—"
        : `${opportunity.signalAgeHours} hours`
    );

    addMetaItem(
      meta,
      "Customer Profile",
      opportunity.customerProfileId
    );

    addMetaItem(
      meta,
      "Why This Customer",
      Array.isArray(
        opportunity.whyThisCustomer
      )
        ? opportunity.whyThisCustomer.join(
            " • "
          )
        : "—"
    );

    addMetaItem(
      meta,
      "Recommended Action",
      opportunity.lead &&
      opportunity.lead.recommendedAction
        ? opportunity.lead.recommendedAction
        : "—"
    );

    addMetaItem(
      meta,
      "Source",
      opportunity.evidence &&
      opportunity.evidence.sourceType
        ? opportunity.evidence.sourceType
        : "—"
    );

    addMetaItem(
      meta,
      "Opportunity ID",
      opportunity.opportunityId
    );

    card.append(
      trigger,
      title,
      meta
    );

    elements.results
      .appendChild(card);
  }

  elements.resultsPanel
    .classList
    .remove("hidden");
}

async function runPreview() {
  elements.runPreviewButton.disabled =
    true;

  elements.downloadCsvButton.disabled =
    true;

  setStatus(
    elements.previewStatus,
    "Evaluating opportunity…"
  );

  try {
    const body =
      buildOpportunityRequest(
        "json"
      );

    const response =
      await authenticatedRequest(
        body
      );

    let payload;

    try {
      payload =
        await response.json();
    } catch {
      throw new Error(
        "Opportunity API returned an invalid response."
      );
    }

    if (!response.ok) {
      throw new Error(
        payload.error ||
        "Opportunity request failed."
      );
    }

    lastSuccessfulPayload =
      body;

    renderOpportunities(
      payload.opportunities
    );

    elements.downloadCsvButton.disabled =
      payload.count === 0;

    setStatus(
      elements.previewStatus,
      payload.count === 1
        ? "1 matched opportunity found."
        : `${payload.count} matched opportunities found.`,
      "success"
    );
  } catch (error) {
    lastSuccessfulPayload =
      null;

    elements.resultsPanel
      .classList
      .add("hidden");

    setStatus(
      elements.previewStatus,
      error.message ||
      "Opportunity preview failed.",
      "error"
    );
  } finally {
    elements.runPreviewButton.disabled =
      false;
  }
}

async function downloadCsv() {
  if (!lastSuccessfulPayload) {
    return;
  }

  elements.downloadCsvButton.disabled =
    true;

  setStatus(
    elements.previewStatus,
    "Preparing CSV…"
  );

  try {
    const response =
      await authenticatedRequest({
        ...lastSuccessfulPayload,
        format:
          "csv"
      });

    if (!response.ok) {
      let message =
        "CSV export failed.";

      try {
        const payload =
          await response.json();

        message =
          payload.error ||
          message;
      } catch {
        // Keep generic message.
      }

      throw new Error(
        message
      );
    }

    const csv =
      await response.text();

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      "opportunities.csv";

    document.body
      .appendChild(anchor);

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(
      url
    );

    setStatus(
      elements.previewStatus,
      "CSV export ready.",
      "success"
    );
  } catch (error) {
    setStatus(
      elements.previewStatus,
      error.message ||
      "CSV export failed.",
      "error"
    );
  } finally {
    elements.downloadCsvButton.disabled =
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
      getAuth(app);

    onAuthStateChanged(
      auth,
      user => {
        setSignedInState(
          user
        );

        if (user) {
          setStatus(
            elements.authStatus,
            `Signed in as ${user.email || user.uid}.`,
            "success"
          );
        } else {
          setStatus(
            elements.authStatus,
            "Sign in with an authorized beta account."
          );
        }
      }
    );

    elements.signInButton
      .addEventListener(
        "click",
        async () => {
          const email =
            elements.email.value.trim();

          const password =
            elements.password.value;

          if (
            !email ||
            !password
          ) {
            setStatus(
              elements.authStatus,
              "Email and password are required.",
              "error"
            );

            return;
          }

          elements.signInButton.disabled =
            true;

          setStatus(
            elements.authStatus,
            "Signing in…"
          );

          try {
            await signInWithEmailAndPassword(
              auth,
              email,
              password
            );
          } catch {
            setStatus(
              elements.authStatus,
              "Sign-in failed. Check the beta account credentials.",
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

    elements.runPreviewButton
      .addEventListener(
        "click",
        runPreview
      );

    elements.downloadCsvButton
      .addEventListener(
        "click",
        downloadCsv
      );
  } catch (error) {
    setSignedInState(
      null
    );

    setStatus(
      elements.authStatus,
      error.message ||
      "Secure login could not be initialized.",
      "error"
    );

    elements.signInButton.disabled =
      true;
  }
}

initialize();
