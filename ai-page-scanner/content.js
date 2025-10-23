/*
  Content script for AI Page Scanner (MVP)
  - Listens for SCAN_PAGE messages
  - Computes lightweight stats about the current document
  - Returns a JSON object without modifying the page
*/

(function () {
  /**
   * Compute basic stats for the current page without mutating the DOM.
   * @returns {object}
   */
  function gatherStats() {
    const nowIso = new Date().toISOString();

    // Defensive lookups
    const doc = document;
    const bodyText = doc && doc.body ? (doc.body.innerText || '') : '';

    // Totals
    const elementCount = doc ? doc.querySelectorAll('*').length : 0;

    // Text metrics
    const characters = bodyText.length;
    const wordsArray = bodyText
      .split(/\s+/)
      .map(w => w.trim())
      .filter(Boolean);
    const words = wordsArray.length;
    const uniqueWords = new Set(wordsArray.map(w => w.toLowerCase())).size;

    // Media-like counts
    const images = doc && doc.images ? doc.images.length : 0;
    const links = doc && doc.links ? doc.links.length : 0;
    const scripts = doc && doc.scripts ? doc.scripts.length : 0;
    const stylesheets = doc ? doc.querySelectorAll('link[rel="stylesheet"]').length : 0;
    const iframes = doc ? doc.querySelectorAll('iframe').length : 0;

    return {
      url: location.href,
      title: doc ? doc.title : '',
      timestamp: nowIso,
      totals: {
        elements: elementCount,
        characters,
        words,
        uniqueWords
      },
      media: {
        images,
        iframes,
        links,
        scripts,
        stylesheets
      }
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'SCAN_PAGE') {
      return; // Not handled; fall through to other listeners if any
    }

    try {
      const stats = gatherStats();
      sendResponse(stats);
    } catch (err) {
      sendResponse({ error: err && err.message ? err.message : String(err) });
    }

    // Return true only if we plan to respond asynchronously; here we respond synchronously
    return true;
  });
})();
