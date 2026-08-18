/**
 * WebsiteReconProvider
 * Inspects public website content for phone numbers, email contacts,
 * meta details, and active digital sales signals.
 */
class WebsiteReconProvider {
  constructor() {
    this.name = "WebsiteReconProvider";
  }

  async reconWebsite(targetUrl) {
    if (!targetUrl || typeof targetUrl !== "string") {
      return this._emptyObservation("Invalid or missing URL");
    }

    let urlToFetch = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(urlToFetch, {
        headers: { "User-Agent": "RyGuyLabs-LeadEngine/2.0 (Bot; Recon)" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return this._emptyObservation(`HTTP Failure ${res.status}`);
      }

      const html = await res.text();

      // Extract Emails via Regex
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const rawEmails = html.match(emailRegex) || [];
      const cleanEmails = [...new Set(rawEmails.map(e => e.toLowerCase()))]
        .filter(e => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.includes("wixpress"));

      // Extract Phone Numbers via Regex
      const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const rawPhones = html.match(phoneRegex) || [];
      const cleanPhones = [...new Set(rawPhones.map(p => p.trim()))];

      // Extract Meta Title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const metaTitle = titleMatch ? titleMatch[1].trim() : null;

      // Detect Digital Weaknesses / Signals
      const signals = [];
      if (!html.includes("viewport")) signals.push("Website missing mobile responsive viewport tag");
      if (!html.includes("gtag") && !html.includes("analytics")) signals.push("No active web analytics pixel detected");
      if (cleanEmails.length === 0) signals.push("No public contact email listed on homepage");

      return {
        status: "success",
        observedUrl: urlToFetch,
        observedAt: new Date().toISOString(),
        metaTitle: metaTitle,
        emails: cleanEmails.map(e => ({
          value: e,
          source: "website_recon",
          confidence: "medium",
          verified: false
        })),
        phones: cleanPhones.map(p => ({
          value: p,
          source: "website_recon",
          confidence: "high"
        })),
        digitalSignals: signals,
        error: null
      };
    } catch (err) {
      return this._emptyObservation(`Recon execution failed: ${err.message}`);
    }
  }

  _emptyObservation(errorMessage) {
    return {
      status: "failed",
      observedUrl: null,
      observedAt: new Date().toISOString(),
      metaTitle: null,
      emails: [],
      phones: [],
      digitalSignals: [],
      error: errorMessage
    };
  }
}

module.exports = { WebsiteReconProvider };
