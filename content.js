/*
  Content script for AI Page Scanner (MVP)
  - Listens for SCAN_PAGE messages
  - Computes lightweight stats about the current document
  - Returns a JSON object without modifying the page
*/

console.log('Content script loaded');

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

  /* 
This array contains predefined CSS selectors for common ad elements (e.g., .ad-banner, #ad-container, etc.).

The allElements array now includes both dynamically detected elements (based on iframe, div, section, aside, img) and explicitly defined elements (from adSelectors).
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

  /* 
  Use window.addEventListener if you want the ad removal to happen automatically on every page load.
  
  Use chrome.runtime.onMessage if you want the ad removal to be triggered manually (e.g., by a user action in the extension popup or background script).
  */

  // Function to scan and remove ads
  const scanAndRemoveAds = () => {
    console.log('scanAndRemoveAds function executed');
    const adCandidates = gatherAdCandidates(100); // Adjust the limit as needed

    adCandidates.forEach((candidate) => {
      if (candidate.keyWordHit) {
        // Find the element in the DOM
        const selector = candidate.id
          ? `#${candidate.id}` // Use ID if available
          : candidate.classList
          ? `.${candidate.classList.split(' ').join('.')}` // Use classList if available
          : null;

        if (selector) {
          const element = document.querySelector(selector);
          if (element) {
            element.remove(); // Remove the ad element from the DOM
            console.log(`Removed ad: ${selector}`);
          } else {
            console.warn(`Element not found for selector: ${selector}`);
          }
        }
      }
    });
  };
  // Run the ad removal script on page load
  window.addEventListener('load', () => {
    scanAndRemoveAds();
  });

  // Allow manual ad removal via a Chrome message
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'SCAN_PAGE') {
      try {
        scanAndRemoveAds();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    }
  });
})();

const scanAndRemoveAds = () => {
  const adCandidates = gatherAdCandidates(100); // Adjust the limit as needed

  adCandidates.forEach((candidate) => {
    if (candidate.keyWordHit) {
      // Find the element in the DOM
      const selector = candidate.id
        ? `#${candidate.id}` // Use ID if available
        : candidate.classList
        ? `.${candidate.classList.split(' ').join('.')}` // Use classList if available
        : null;

      if (selector) {
        removeAd(selector); // Use the removeAd utility function
        console.log(`Removed ad: ${selector}`);
      }
    }
  });
};

console.log('Ad Candidates:', gatherAdCandidates(candidateLimit));
console.log('Removing target:', target);
console.log('Scanning and removing ads...');
console.log('Ad Candidates:', adCandidates);
console.log('Generated selector:', selector);
