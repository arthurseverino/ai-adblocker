/*
  Content script for AI Page Scanner (MVP)
  - Listens for SCAN_PAGE messages
  - Computes lightweight stats about the current document
  - Returns a JSON object without modifying the page
*/

(function () {
  function gatherStats() {
    const doc = document; // represents the entire HTML page
    const candidateLimit = 25; // Easily changable to increase the amount we scan as storage increases

    return {
      url: location.href,
      title: doc ? doc.title : '',
      timestamp: new Date().toISOString(),
      adCandidates: gatherAdCandidates(candidateLimit),
    };
  }

  /**
   * Removes elements from the DOM based on a given CSS selector or element reference.
   * @param {string | HTMLElement | HTMLElement[]} target - The path to the ad (CSS selector or DOM element(s)).
   */

  const removeAd = (target) => {
    try {
      if (typeof target === 'string') {
        // If the target is a CSS selector, find all matching elements
        const elements = document.querySelectorAll(target);
        elements.forEach((el) => el.remove());
      } else if (target instanceof HTMLElement) {
        // If the target is a single DOM element, remove it directly
        target.remove();
      } else if (Array.isArray(target)) {
        // If the target is an array of DOM elements, remove each one
        target.forEach((el) => {
          if (el instanceof HTMLElement) {
            el.remove();
          }
        });
      } else {
        console.warn('Invalid target provided for ad removal.');
      }
    } catch (error) {
      console.error('Error removing ad:', error);
    }
  };

  /* Explanation of Changes:
Added adSelectors Array:

This array contains predefined CSS selectors for common ad elements (e.g., .ad-banner, #ad-container, etc.).
Integrated adSelectors into allElements:

For each selector in adSelectors, the code uses document.querySelectorAll to find matching elements and adds them to the allElements array.
The flatMap method ensures that all matching elements are flattened into a single array.
Combined Dynamic and Predefined Detection:

The allElements array now includes both dynamically detected elements (based on iframe, div, section, aside, img) and explicitly defined elements (from adSelectors).

Flexibility: The adSelectors array allows you to explicitly target known ad patterns, while the keyword matching handles more generic cases.

Scalability: You can easily add more selectors to the adSelectors array as you encounter new ad patterns.
 */

  function gatherAdCandidates(limit) {
    // Predefined ad selectors array
    const adSelectors = [
      '.ad-banner', // Example: class for banner ads
      '#ad-container', // Example: ID for ad containers
      '.ad-slot', // Example: class for ad slots
      '[id^="ad-"]', // Example: IDs starting with "ad-"
      '[class*="ad"]', // Example: classes containing "ad"
    ];

    // Collect all elements that might contain ads (temporary in memory, not saved)
    const allElements = [
      ...document.querySelectorAll('iframe, div, section, aside, img'),
      ...adSelectors.flatMap((selector) => [
        ...document.querySelectorAll(selector),
      ]),
    ];

    // Collect n elements that will be analyzed and stored (n = limit)
    const scannedElements = allElements.slice(0, limit);

    // Safer keyword detector that avoids things like "header" and "adapter"
    const keyWords =
      /\bads?\b|\bsponsor(ed)?\b|\bpromo(tion|ted)?\b|\bgoogle[_-]ads?\b|\bbanner\b/i;

    const findMatch = (str) => {
      // Finds a match within the keywords and only returns the word
      if (!str) return null;
      const m = String(str).match(keyWords);
      return m ? m[0] : null;
    };

    // Gathers only useful data fields from the scanned elements for scoring usage
    const elementData = scannedElements.map((el) => {
      // temp placeholders for the keyword lookup
      const idStr = el.id || '';
      const classStr = String(el.className || '');
      const textStr = (el.innerText || '').slice(0, 100);

      const idMatch = findMatch(idStr);
      const classMatch = findMatch(classStr);
      const textMatch = findMatch(textStr);

      // Simple if else blocks to check where the match was and the word
      let keyWordHit = false,
        keyWordSource = null,
        keyWordMatch = null;
      if (idMatch) {
        keyWordHit = true;
        keyWordSource = 'id';
        keyWordMatch = idMatch;
      } else if (classMatch) {
        keyWordHit = true;
        keyWordSource = 'class';
        keyWordMatch = classMatch;
      } else if (textMatch) {
        keyWordHit = true;
        keyWordSource = 'text';
        keyWordMatch = textMatch;
      }

      const rect = el.getBoundingClientRect(); // gives size and position
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const area = width * height; // helps estimate ad-like dimensions

      // Detects both direct <iframe> elements and containers that wrap an <iframe>
      const isIframe =
        el.tagName === 'IFRAME' || Boolean(el.querySelector('iframe'));

      return {
        keyWordHit /* Boolean value if we hit on a keyword */,
        keyWordSource /* Where the match is located */,
        keyWordMatch /* What the matched keyword was */,
        isIframe /* IFRAME is the strongest indicator of an ad easy weight assignment */,
        tag: el.tagName /* DIV, IFRAME, IMG, etc */,
        id: idStr /* Element id that can include things like "ad", "banner", etc */,
        classList:
          classStr /* Elements CSS classes for matching key words like "ad", "adslot", "sponsor", "promo", "google_ads"*/,
        width,
        height,
        area,
      };
    });
    return elementData;
  }

  /* Use window.addEventListener if you want the ad removal to happen automatically on every page load.
  
Use chrome.runtime.onMessage if you want the ad removal to be triggered manually (e.g., by a user action in the extension popup or background script).*/

  // Function to scan and remove ads
  const scanAndRemoveAds = () => {
    adSelectors.forEach((selector) => {
      const ads = document.querySelectorAll(selector);
      removeAd([...ads]); // Use the removeAd function to remove detected ads
    });
  };

  // Run the ad removal script on page load
  window.addEventListener('load', () => {
    scanAndRemoveAds();
  });

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
