const crypto =
  require("crypto");

class CustomerProspectStateStore {
  constructor({
    db,
    serverTimestamp = null
  } = {}) {
    if (!db) {
      throw new Error(
        "CustomerProspectStateStore requires a Firestore database."
      );
    }

    this.db =
      db;

    this.serverTimestamp =
      serverTimestamp;
  }

  normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeDomain(value) {
    let clean =
      this.normalizeText(
        value
      )
        .toLowerCase();

    if (!clean) {
      return null;
    }

    try {
      if (
        clean.startsWith("http://") ||
        clean.startsWith("https://")
      ) {
        clean =
          new URL(clean)
            .hostname
            .toLowerCase();
      }
    } catch {
      return null;
    }

    clean =
      clean
        .replace(/^www\./, "")
        .replace(/\/+$/, "");

    return clean || null;
  }

  normalizeRegistrationId(
    value
  ) {
    const clean =
      this.normalizeText(
        value
      )
        .toUpperCase();

    return clean || null;
  }

  normalizeProspectName(
    value
  ) {
    const clean =
      this.normalizeText(
        value
      )
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(
          /[^a-z0-9]+/g,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();

    return clean || null;
  }

  buildIdentity({
    registrationId = null,
    candidateDomain = null,
    website = null,
    prospectName = null
  } = {}) {
    const normalizedRegistrationId =
      this.normalizeRegistrationId(
        registrationId
      );

    if (normalizedRegistrationId) {
      return {
        type:
          "registration_id",

        value:
          normalizedRegistrationId
      };
    }

    const normalizedDomain =
      this.normalizeDomain(
        candidateDomain ||
        website
      );

    if (normalizedDomain) {
      return {
        type:
          "domain",

        value:
          normalizedDomain
      };
    }

    const normalizedName =
      this.normalizeProspectName(
        prospectName
      );

    if (normalizedName) {
      return {
        type:
          "prospect_name",

        value:
          normalizedName
      };
    }

    throw new Error(
      "A stable prospect identity could not be derived."
    );
  }

  buildProspectKey(
    prospect
  ) {
    const identity =
      this.buildIdentity(
        prospect
      );

    const hash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          `${identity.type}:${identity.value}`
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        );

    return {
      prospectKey:
        `prospect_${hash}`,

      identity
    };
  }

  validateUid(
    uid
  ) {
    const cleanUid =
      this.normalizeText(
        uid
      );

    if (!cleanUid) {
      throw new Error(
        "Customer UID is required."
      );
    }

    return cleanUid;
  }

  normalizeNullableString(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const clean =
      this.normalizeText(
        value
      );

    return clean || null;
  }

  normalizeEstimatedValue(
    value
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const number =
      Number(
        value
      );

    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      throw new Error(
        "estimatedValue must be a non-negative number."
      );
    }

    return number;
  }

  buildStateRecord({
    uid,
    prospect,
    qualification = {}
  } = {}) {
    const cleanUid =
      this.validateUid(
        uid
      );

    if (
      !prospect ||
      typeof prospect !==
        "object"
    ) {
      throw new Error(
        "Prospect data is required."
      );
    }

    const {
      prospectKey,
      identity
    } =
      this.buildProspectKey(
        prospect
      );

    const nowValue =
      this.serverTimestamp
        ? this.serverTimestamp()
        : new Date().toISOString();

    return {
      prospectKey,

      customerUid:
        cleanUid,

      identity,

      prospect: {
        prospectName:
          this.normalizeNullableString(
            prospect.prospectName
          ),

        candidateName:
          this.normalizeNullableString(
            prospect.candidateName
          ),

        candidateDomain:
          this.normalizeDomain(
            prospect.candidateDomain
          ),

        website:
          this.normalizeNullableString(
            prospect.website
          ),

        registrationId:
          this.normalizeRegistrationId(
            prospect.registrationId
          )
      },

      salesState: {
        status:
          this.normalizeNullableString(
            qualification.status
          ),

        priority:
          this.normalizeNullableString(
            qualification.priority
          ),

        estimatedValue:
          this.normalizeEstimatedValue(
            qualification.estimatedValue
          ),

        timing:
          this.normalizeNullableString(
            qualification.timing
          ),

        nextAction:
          this.normalizeNullableString(
            qualification.nextAction
          ),

        followUpDate:
          this.normalizeNullableString(
            qualification.followUpDate
          ),

        contactName:
          this.normalizeNullableString(
            qualification.contactName
          ),

        contactRole:
          this.normalizeNullableString(
            qualification.contactRole
          ),

        notes:
          this.normalizeNullableString(
            qualification.notes
          )
      },

      updatedAt:
        nowValue
    };
  }

  prospectDocumentRef(
    uid,
    prospectKey
  ) {
    return this.db
      .collection(
        "customer_prospect_state"
      )
      .doc(
        uid
      )
      .collection(
        "prospects"
      )
      .doc(
        prospectKey
      );
  }

  async saveQualification({
    uid,
    prospect,
    qualification
  } = {}) {
    const record =
      this.buildStateRecord({
        uid,
        prospect,
        qualification
      });

    const ref =
      this.prospectDocumentRef(
        record.customerUid,
        record.prospectKey
      );

    await ref.set(
      {
        ...record,

        createdAt:
          this.serverTimestamp
            ? this.serverTimestamp()
            : new Date().toISOString()
      },
      {
        merge:
          true
      }
    );

    return record;
  }
}

module.exports = {
  CustomerProspectStateStore
};
