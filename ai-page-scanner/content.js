/*
  Content script for AI Page Scanner (MVP)
  - Listens for SCAN_PAGE messages
  - Computes lightweight stats about the current document
  - Returns a JSON object without modifying the page
*/

(function () {
  function gatherStats() {
    const doc = document;      // represents the entire HTML page
    const candidateLimit = 25; // Easily changable to increase the amount we scan as storage increases


    return {
      url: location.href,
      title: doc ? doc.title : '',
      timestamp: new Date().toISOString(),
      adCandidates: gatherAdCandidates(candidateLimit)
    };
  }

  function gatherAdCandidates(limit){
    // Collect all elements that might contain ads (temporary in memory, not saved)
    const allElements = [...document.querySelectorAll("iframe, div, section, aside, img")];

    // Collect n elements that will be analyzed and stored (n = limit)
    const scannedElements = allElements.slice(0, limit);

    // Safer keyword detector that avoids things like "header" and "adapter"
    const keyWords = /\bads?\b|\bsponsor(ed)?\b|\bpromo(tion|ted)?\b|\bgoogle[_-]ads?\b|\bbanner\b/i;

    function findMatch(str){ // Finds a match within the keywords and only returns the word
        if (!str) return null;
        const m = String(str).match(keyWords);
        return m ? m[0] : null;
      }

    // Gathers only useful data fields from the scanned elements for scoring usage
    const elementData = scannedElements.map(el => {
      // temp placeholders for the keyword lookup
      const idStr = el.id || "";
      const classStr = String(el.className || "");
      const textStr = (el.innerText || "").slice(0, 100);

      const idMatch = findMatch(idStr);
      const classMatch = findMatch(classStr);
      const textMatch = findMatch(textStr);


      // Simple if else blocks to check where the match was and the word
      // Could help in scoring and assigning weights where id > class > text
      let keyWordHit = false, keyWordSource = null, keyWordMatch = null;
      if (idMatch){
        keyWordHit = true;
        keyWordSource = "id";
        keyWordMatch = idMatch;
      }
      else if (classMatch){
        keyWordHit = true;
        keyWordSource = "class";
        keyWordMatch = classMatch;
      }
      else if (textMatch){
        keyWordHit = true;
        keyWordSource = "text";
        keyWordMatch = textMatch;
      }
      
      /*
      Top-performing ad sizes - Goolge Ad Manager Help https://support.google.com/admanager/answer/1100453?hl=en#topPerforming
      Ad size	Description
      728 × 90 (Leaderboard)
      300 × 250 (Medium Rectangle)
      160 × 600 (Wide Skyscraper)
      320 × 50 (Mobile banner) 
      */

      const rect = el.getBoundingClientRect();  // gives size and position
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const area = width * height;              // helps estimate ad like dimensions


      // Detects both direct <iframe> elements and containers that wrap an <iframe>
      const isIframe = el.tagName === "IFRAME" || Boolean(el.querySelector("iframe"));
    
      return {
        keyWordHit,              /* Boolean value if we hit on a keyword */
        keyWordSource,           /* Where the match is located */
        keyWordMatch,            /* What the matched keyword was */
        isIframe,                /* IFRAME is the strongest indicator of an ad easy weight assignment */ 
        tag: el.tagName,         /* DIV, IFRAME, IMG, etc */
        id: idStr,               /* Element id that can include things like "ad", "banner", etc */
        classList: classStr,  /* Elements CSS classes for matching key words like "ad", "adslot", "sponsor", "promo", "google_ads"*/
        width,
        height,
        area,
      };
    });
    return elementData;
    
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
