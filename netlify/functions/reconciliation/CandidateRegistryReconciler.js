class CandidateRegistryReconciler {
  constructor({
    database
  } = {}) {
    if (!database) {
      throw new Error(
        "CandidateRegistryReconciler requires a registry database."
      );
    }

    this.database =
      database;
  }

  normalizeCompanyName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\b(l\.?l\.?c\.?|incorporated|inc\.?|corp\.?|corporation|company|co\.?)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  tokenSet(value) {
    return new Set(
      this.normalizeCompanyName(value)
        .split(" ")
        .filter(
          token =>
            token.length >= 2
        )
    );
  }

  calculateNameSimilarity(
    candidateName,
    registryName
  ) {
    const candidateNormalized =
      this.normalizeCompanyName(
        candidateName
      );

    const registryNormalized =
      this.normalizeCompanyName(
        registryName
      );

    if (
      !candidateNormalized ||
      !registryNormalized
    ) {
      return 0;
    }

    if (
      candidateNormalized ===
      registryNormalized
    ) {
      return 1;
    }

    const candidateTokens =
      this.tokenSet(
        candidateName
      );

    const registryTokens =
      this.tokenSet(
        registryName
      );

    if (
      candidateTokens.size === 0 ||
      registryTokens.size === 0
    ) {
      return 0;
    }

    let intersection = 0;

    for (
      const token of candidateTokens
    ) {
      if (
        registryTokens.has(token)
      ) {
        intersection++;
      }
    }

    const union =
      new Set([
        ...candidateTokens,
        ...registryTokens
      ]).size;

    return union > 0
      ? intersection / union
      : 0;
  }

  async reconcile(
    candidate,
    {
      city = null,
      state = "FL",
      limit = 10,
      minimumSimilarity = 0.6
    } = {}
  ) {
    if (
      !candidate ||
      typeof candidate !== "object"
    ) {
      throw new Error(
        "CandidateRegistryReconciler requires a candidate object."
      );
    }

    const candidateName =
      String(
        candidate.candidateName ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

    if (!candidateName) {
      return {
        status:
          "registry_not_found_in_current_dataset",

        candidate,

        registryMatch:
          null,

        confidence:
          0,

        alternatives:
          []
      };
    }

    const records =
      await this.database.findCompanyMatches({
        companyName:
          candidateName,

        city,

        state,

        limit
      });

    const scored =
      records
        .map(record => ({
          record,

          similarity:
            this.calculateNameSimilarity(
              candidateName,
              record.companyName
            )
        }))
        .sort(
          (a, b) =>
            b.similarity -
            a.similarity
        );

    const best =
      scored[0] ||
      null;

    if (
      !best ||
      best.similarity <
        minimumSimilarity
    ) {
      return {
        status:
          "registry_not_found_in_current_dataset",

        candidate,

        registryMatch:
          null,

        confidence:
          best?.similarity ||
          0,

        alternatives:
          scored.slice(0, 3)
      };
    }

    return {
      status:
        "registry_matched",

      candidate,

      registryMatch:
        best.record,

      confidence:
        best.similarity,

      alternatives:
        scored
          .slice(1, 3)
    };
  }
}

module.exports = {
  CandidateRegistryReconciler
};
