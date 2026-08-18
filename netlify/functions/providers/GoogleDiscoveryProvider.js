/**
 * GoogleDiscoveryProvider
 * Discovery Layer: Identifies corporate candidate names and URLs via Search.
 * Does NOT generate corporate registration records or claim authority.
 */
class GoogleDiscoveryProvider {
  constructor() {
    this.name = "GoogleDiscoveryProvider";
  }

  async discoverCandidates(query, geoContext, options = {}) {
    const apiKey = process.env.RYGUY_SEARCH_API_KEY || process.env.LEAD_QUALIFIER_API_KEY;
    const cseId = process.env.CORP_COMP_CSE_ID || process.env.DIR_INFO_CSE_ID || process.env.RYGUY_SEARCH_ENGINE_ID;
    const limit = options.limit || 10;

    if (!apiKey || !cseId) {
      console.warn(`[${this.name}] Missing Search API Keys. Discovery skipped.`);
      return [];
    }

    const stateStr = geoContext?.state || "FL";
    const cityStr = geoContext?.city || "";
    const searchQuery = `"${query}" "${cityStr}" "${stateStr}" "LLC" OR "INC"`;
    
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(searchQuery)}&num=${Math.min(limit, 10)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (!data.items || !Array.isArray(data.items)) {
        return [];
      }

      return data.items.map((item, idx) => {
        const rawTitle = item.title || "";
        const cleanName = rawTitle
          .replace(/\|.*/g, "")
          .replace(/Division of Corporations/gi, "")
          .replace(/Sunbiz/gi, "")
          .replace(/Florida Department of State/gi, "")
          .trim();

        return {
          discoveryIndex: idx,
          candidateName: cleanName,
          snippet: item.snippet || "",
          displayLink: item.displayLink || "",
          formattedUrl: item.link || "",
          discoveredAt: new Date().toISOString()
        };
      });
    } catch (err) {
      console.error(`[${this.name} Error]:`, err.message);
      return [];
    }
  }
}

module.exports = { GoogleDiscoveryProvider };
