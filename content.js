/*
  Content script for AI Page Scanner (MVP)
  - Listens for SCAN_PAGE messages
  - Computes lightweight stats about the current document
  - Uses AI API to detect and remove ads
*/

console.log('Content script loaded');

// Gathers potential ad elements from the page for analysis
const gatherAdCandidates = (limit) => {
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
};

const gatherStats = () => {
  const doc = document;
  const candidateLimit = 500;

  return {
    url: location.href,
    title: doc?.title || '',
    timestamp: new Date().toISOString(),
    adCandidates: gatherAdCandidates(candidateLimit),
  };
};

console.log('gatherStats(): ', gatherStats());

/* 
  Use window.addEventListener if you want the ad removal to happen automatically on every page load.
  
  Use chrome.runtime.onMessage if you want the ad removal to be triggered manually (e.g., by a user action in the extension popup or background script).
  */

// Function to scan and remove ads using AI
const scanAndRemoveAds = async () => {
  console.log('scanAndRemoveAds function executed');
  const adCandidates = gatherAdCandidates(500);

  try {
    // Call the AI API for predictions
    const response = await fetch('http://localhost:5000/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        adCandidates: adCandidates,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI Predictions:', data);

    // Remove elements that are predicted to be ads
    data.predictions.forEach((prediction) => {
      if (prediction.isAd) {
        const candidate = adCandidates[prediction.index];
        const selector = prediction.selector;

        // Try to find and remove the element
        let element = document.querySelector(selector);

        // Fallback: if selector doesn't work, try finding by other attributes
        if (!element && candidate.id) {
          element = document.getElementById(candidate.id);
        }

        if (element) {
          element.remove();
          console.log(
            `✓ Removed ad (${prediction.confidence}% confidence): ${selector}`
          );
        } else {
          console.warn(`✗ Element not found for selector: ${selector}`);
        }
      }
    });

    console.log(
      `Scan complete: ${data.ads_detected} ads detected out of ${data.total_scanned} elements`
    );
  } catch (error) {
    console.error('AI ad detection failed:', error);
    console.log('Falling back to keyword-based detection...');

    // Fallback to simple keyword detection if API fails
    adCandidates.forEach((candidate) => {
      if (candidate.keyWordHit) {
        const selector = candidate.id
          ? `#${candidate.id}`
          : candidate.classList
          ? `.${candidate.classList.split(' ').join('.')}`
          : null;

        if (selector) {
          const element = document.querySelector(selector);
          if (element) {
            element.remove();
            console.log(`Removed ad (fallback): ${selector}`);
          }
        }
      }
    });
  }
};

// Run the ad removal script on page load
window.addEventListener('load', () => {
  scanAndRemoveAds();
});

// Allow manual ad removal via a Chrome message
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'SCAN_PAGE') {
    console.log('Received SCAN_PAGE message');
    
    // Run async function and handle response
    scanAndRemoveAds()
      .then(() => {
        sendResponse({ success: true, message: 'AI scan complete' });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    
    // Return true to indicate async response
    return true;
  }
});

console.log('Ad Candidates:', gatherAdCandidates(500));