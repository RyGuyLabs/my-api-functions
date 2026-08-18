const { websiteRecon } = require("./websiterecon");
const { contactSearch } = require("./contactSearch");

/**
 * Shared enrichment helper for Firebase and Netlify runtimes.
 *
 * Registry providers establish identity.
 * Discovery providers identify possible web properties.
 * Enrichment providers observe publicly available contact/digital signals.
 *
 * No enrichment result is treated as authoritative registry evidence.
 */
async function enrichProspect(
  normalized,
  candidateInfo = null
) {
  const startedAt = Date.now();

  const result = {
    website: null,

    businessPhone: null,

    emails: [],

    phones: [],

    digitalSignals: [],

    contacts: [],

    status: "partial",

    errors: [],

    providerResults: {},

    enrichedAt:
      new Date().toISOString()
  };

  /*
   * --------------------------------------------------------------------------
   * 1. DETERMINE WEBSITE TARGET
   * --------------------------------------------------------------------------
   */

  const targetWebsite =
    normalized?.website ||
    candidateInfo?.formattedUrl ||
    candidateInfo?.website ||
    null;

  /*
   * --------------------------------------------------------------------------
   * 2. WEBSITE RECONNAISSANCE
   * --------------------------------------------------------------------------
   */

  if (targetWebsite) {
    try {
      const websiteData =
        await websiteRecon(
          targetWebsite
        );

      result.providerResults.websiteRecon = {
        provider: "WebsiteReconProvider",

        status:
          websiteData?.status === "success"
            ? "success"
            : "failed"
      };

      /*
       * Preserve the discovered website.
       */
      if (websiteData) {
        result.website =
          websiteData.website ||
          websiteData.url ||
          targetWebsite;
      }

      /*
       * Normalize discovered emails.
       */
      if (
        Array.isArray(
          websiteData?.emails
        )
      ) {
        result.emails.push(
          ...normalizeContactValues(
            websiteData.emails,
            "website_recon"
          )
        );
      }

      /*
       * Normalize discovered phones.
       */
      if (
        Array.isArray(
          websiteData?.phones
        )
      ) {
        result.phones.push(
          ...normalizeContactValues(
            websiteData.phones,
            "website_recon"
          )
        );
      }

      /*
       * Preserve digital observations.
       */
      if (
        Array.isArray(
          websiteData?.digitalSignals
        )
      ) {
        result.digitalSignals.push(
          ...websiteData.digitalSignals
        );
      }

      if (
        websiteData?.status === "success"
      ) {
        result.status = "complete";
      }

    } catch (error) {

      console.error(
        `[WEBSITE RECON FAILED] ${normalized?.companyName || "Prospect"}:`,
        error.message
      );

      result.providerResults.websiteRecon = {
        provider: "WebsiteReconProvider",
        status: "failed"
      };

      result.errors.push({
        stage: "websiteRecon",
        provider: "WebsiteReconProvider",
        message:
          error.message
      });
    }
  }

  /*
   * --------------------------------------------------------------------------
   * 3. CONTACT DISCOVERY
   * --------------------------------------------------------------------------
   *
   * Contact discovery remains independent from website reconnaissance.
   *
   * A company may have publicly indexed contact information even when its
   * website cannot be reached.
   * --------------------------------------------------------------------------
   */

  try {

    const contactData =
      await contactSearch(
        normalized?.companyName,
        normalized?.location
      );

    result.providerResults.contactSearch = {
      provider: "ContactSearchProvider",

      status:
        contactData?.status === "failed"
          ? "failed"
          : "success"
    };

    if (
      Array.isArray(
        contactData?.emails
      )
    ) {
      result.emails.push(
        ...normalizeContactValues(
          contactData.emails,
          "contact_search"
        )
      );
    }

    if (
      Array.isArray(
        contactData?.phones
      )
    ) {
      result.phones.push(
        ...normalizeContactValues(
          contactData.phones,
          "contact_search"
        )
      );
    }

    if (
      Array.isArray(
        contactData?.contacts
      )
    ) {
      result.contacts.push(
        ...contactData.contacts
      );
    }

    if (
      contactData?.status === "failed"
    ) {
      result.errors.push({
        stage: "contactSearch",
        provider: "ContactSearchProvider",
        message:
          contactData.errors?.[0]?.message ||
          "Contact search failed."
      });
    }

  } catch (error) {

    console.error(
      `[CONTACT SEARCH FAILED] ${normalized?.companyName || "Prospect"}:`,
      error.message
    );

    result.providerResults.contactSearch = {
      provider: "ContactSearchProvider",
      status: "failed"
    };

    result.errors.push({
      stage: "contactSearch",
      provider: "ContactSearchProvider",
      message:
        error.message
    });
  }

  /*
   * --------------------------------------------------------------------------
   * 4. DEDUPLICATE CONTACT DATA
   * --------------------------------------------------------------------------
   */

  result.emails =
    dedupeContactValues(
      result.emails
    );

  result.phones =
    dedupeContactValues(
      result.phones
    );

  result.contacts =
    dedupeContacts(
      result.contacts
    );

  /*
   * --------------------------------------------------------------------------
   * 5. DERIVE PRIMARY BUSINESS PHONE
   * --------------------------------------------------------------------------
   */

  result.businessPhone =
    result.phones[0]?.value ||
    null;

  /*
   * --------------------------------------------------------------------------
   * 6. DETERMINE FINAL ENRICHMENT STATUS
   * --------------------------------------------------------------------------
   */

  const hasData =
    Boolean(result.website) ||
    result.emails.length > 0 ||
    result.phones.length > 0 ||
    result.contacts.length > 0 ||
    result.digitalSignals.length > 0;

  const hasSuccessfulProvider =
    Object.values(
      result.providerResults
    ).some(
      provider =>
        provider?.status === "success"
    );

  if (
    hasSuccessfulProvider &&
    hasData
  ) {

    result.status =
      "complete";

  } else if (
    result.errors.length > 0
  ) {

    result.status =
      "partial";

  } else {

    result.status =
      "empty";
  }

  result.durationMs =
    Date.now() - startedAt;

  return result;
}


/**
 * Normalize provider contact values into
 * a predictable internal structure.
 */
function normalizeContactValues(
  values,
  source
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter(Boolean)
    .map(value => {

      if (
        typeof value === "string"
      ) {
        return {
          value:
            value.trim(),

          source
        };
      }

      return {
        ...value,

        value:
          String(
            value.value || ""
          ).trim(),

        source:
          value.source ||
          source
      };

    })
    .filter(
      item =>
        Boolean(item.value)
    );
}


/**
 * Deduplicate email / phone observations.
 */
function dedupeContactValues(
  values
) {
  const seen =
    new Set();

  return values.filter(
    item => {

      const key =
        String(
          item?.value || ""
        )
          .toLowerCase()
          .replace(
            /[\s().-]/g,
            ""
          );

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}


/**
 * Deduplicate contact records.
 */
function dedupeContacts(
  contacts
) {
  const seen =
    new Set();

  return contacts.filter(
    contact => {

      const key =
        [
          contact?.name,
          contact?.email,
          contact?.phone
        ]
          .filter(Boolean)
          .join("|")
          .toLowerCase();

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}


module.exports = {
  enrichProspect
};
