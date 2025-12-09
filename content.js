/*
  Content script for AI Page Scanner (MVP)
  - Listens for SCAN_PAGE messages
  - Computes lightweight stats about the current document
  - Uses AI API to detect and remove ads
*/

console.log('Content script loaded');

// Gathers potential ad elements from the page for analysis
// Import configuration (will be injected by extension)
// For now, use inline config that matches config.js
const CONTENT_CONFIG = {
  MAX_CANDIDATES: 500,
  CONFIDENCE_THRESHOLD: 80,
  SKIP_GENERIC_SELECTORS: ['div', 'section'],
  REQUIRES_STRONG_SIGNAL: true,
};

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

  // Remove duplicates using Set
  const uniqueElements = Array.from(new Set(allElements));
  
  // Collect n elements that will be analyzed and stored (n = limit)
  const scannedElements = uniqueElements.slice(0, Math.min(limit, CONTENT_CONFIG.MAX_CANDIDATES));

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
  const totalElements = document.querySelectorAll("*").length;

  return {
    url: location.href,
    title: doc?.title || '',
    timestamp: new Date().toISOString(),
    adCandidates: gatherAdCandidates(totalElements),
  };
};

const callAIModelViaBackground = (adCandidates) => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {type: "PREDICT_ADS", adCandidates},
      (response) => {
        if (chrome.runtime.lastError) {
          // Error talking to background / extension
          return reject(chrome.runtime.lastError);
        }
        if(!response || !response.success) {
          // Background reported failure (e.g., backend down)
          return reject(response?.error || 'Unknown error from background');

        }
        resolve(response.data);
      }
    );
  });
};

console.log('gatherStats(): ', gatherStats());

/* 
  Use window.addEventListener if you want the ad removal to happen automatically on every page load.
  
  Use chrome.runtime.onMessage if you want the ad removal to be triggered manually (e.g., by a user action in the extension popup or background script).
  */

/**
 * Get current domain
 */
function getCurrentDomain() {
  try {
    return window.location.hostname.replace('www.', '');
  } catch (e) {
    return '';
  }
}

/**
 * Check if domain is whitelisted
 */
async function isWhitelisted() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_WHITELIST', domain: getCurrentDomain() });
    return response && response.whitelisted;
  } catch (e) {
    return false;
  }
}

/**
 * Get settings from storage
 */
async function getSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    return response && response.settings ? response.settings : {
      enabled: true,
      confidenceThreshold: 80,
      showVisualFeedback: true
    };
  } catch (e) {
    return {
      enabled: true,
      confidenceThreshold: 80,
      showVisualFeedback: true
    };
  }
}

/**
 * Inject CSS to help collapse empty ad spaces
 */
function injectCollapseCSS() {
  if (document.getElementById('ai-adblocker-collapse-css')) return;
  
  const style = document.createElement('style');
  style.id = 'ai-adblocker-collapse-css';
  style.textContent = `
    /* Collapse empty ad containers */
    [class*="ad"][style*="height"],
    [id*="ad"][style*="height"],
    [class*="banner"][style*="height"],
    [id*="banner"][style*="height"] {
      min-height: 0 !important;
      height: auto !important;
    }
    
    /* Hide empty ad containers */
    [class*="ad"]:empty,
    [id*="ad"]:empty,
    [class*="banner"]:empty,
    [id*="banner"]:empty {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Remove element and clean up empty parent containers
 * This prevents leaving empty spaces/blocks behind
 */
function removeElementAndCleanup(element) {
  if (!element || !element.parentNode) return;
  
  // Store parent for cleanup check
  const parent = element.parentNode;
  
  // Remove the element immediately
  element.remove();
  
  // Clean up empty parent containers (up to 2 levels deep to avoid breaking layout)
  let currentParent = parent;
  let depth = 0;
  const maxDepth = 2;
  
  while (currentParent && depth < maxDepth && currentParent !== document.body) {
    // Check if parent is now empty or only contains whitespace/empty elements
    const hasVisibleContent = Array.from(currentParent.childNodes).some(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent.trim().length > 0;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip script, style, and other non-visible elements
        const tagName = node.tagName?.toLowerCase();
        if (['script', 'style', 'noscript', 'meta', 'link', 'br', 'hr'].includes(tagName)) {
          return false;
        }
        // Check if element has visible content or is not hidden
        const computedStyle = window.getComputedStyle(node);
        const isHidden = computedStyle.display === 'none' || 
                        computedStyle.visibility === 'hidden' ||
                        parseFloat(computedStyle.opacity) === 0;
        
        if (isHidden) return false;
        
        // Element has visible content
        return node.offsetWidth > 0 || node.offsetHeight > 0 || 
               node.textContent.trim().length > 0 ||
               node.children.length > 0;
      }
      return false;
    });
    
    // If parent is empty and is a common ad container type, remove it
    if (!hasVisibleContent) {
      const tagName = currentParent.tagName?.toLowerCase();
      const className = currentParent.className || '';
      const id = currentParent.id || '';
      
      // Only remove if it looks like an ad container
      const isAdContainer = 
        (tagName === 'div' || tagName === 'aside' || tagName === 'section') && (
          /ad|banner|sponsor|promo|widget/i.test(className) ||
          /ad|banner|sponsor|promo|widget/i.test(id) ||
          currentParent.children.length === 0
        );
      
      if (isAdContainer) {
        const nextParent = currentParent.parentNode;
        currentParent.remove();
        currentParent = nextParent;
        depth++;
      } else {
        break; // Don't remove non-ad containers
      }
    } else {
      break; // Parent has content, stop cleanup
    }
  }
}

/**
 * Show visual feedback when ad is removed
 */
function showVisualFeedback(element, selector) {
  // Create a temporary highlight
  const highlight = document.createElement('div');
  highlight.style.cssText = `
    position: absolute;
    top: ${element.getBoundingClientRect().top + window.scrollY}px;
    left: ${element.getBoundingClientRect().left + window.scrollX}px;
    width: ${element.offsetWidth}px;
    height: ${element.offsetHeight}px;
    background: rgba(255, 0, 0, 0.3);
    border: 2px solid #f44336;
    pointer-events: none;
    z-index: 999999;
    animation: fadeOut 0.5s ease-out forwards;
  `;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(highlight);
  setTimeout(() => {
    highlight.remove();
    style.remove();
  }, 500);
}

// Function to scan and remove ads using AI
const scanAndRemoveAds = async (settingsOverride = null) => {
  const scanId = `scan_${Date.now()}`;
  console.log(`[CONTENT] [${scanId}] Starting ad scan...`);

  // Get settings
  const settings = settingsOverride || await getSettings();
  
  // Check if enabled
  if (!settings.enabled) {
    console.log(`[CONTENT] [${scanId}] Ad blocking is disabled`);
    return { adsBlocked: 0, totalScanned: 0 };
  }

  // Check whitelist
  const whitelisted = await isWhitelisted();
  if (whitelisted) {
    console.log(`[CONTENT] [${scanId}] Site is whitelisted, skipping ad blocking`);
    return { adsBlocked: 0, totalScanned: 0 };
  }

  const totalElements = document.querySelectorAll("*").length;
  const maxCandidates = Math.min(totalElements, CONTENT_CONFIG.MAX_CANDIDATES);
  const adCandidates = gatherAdCandidates(maxCandidates);
  
  console.log(`[CONTENT] [${scanId}] Found ${adCandidates.length} candidates from ${totalElements} total elements`);

  let adsBlocked = 0;

  try {
    // Call the AI API for predictions
    console.log(`[CONTENT] [${scanId}] Sending ${adCandidates.length} candidates to background for AI prediction...`);

    const data = await callAIModelViaBackground(adCandidates);
    console.log(`[CONTENT] [${scanId}] AI Predictions received: ${data.ads_detected} ads detected`);

    // Remove elements that are predicted to be ads
    data.predictions.forEach((prediction) => {
      // Use custom confidence threshold if provided
      const threshold = settings.confidenceThreshold || CONTENT_CONFIG.CONFIDENCE_THRESHOLD || 80;
      const isAd = prediction.confidence >= threshold;
      
      if (isAd) {
        const candidate = adCandidates[prediction.index];
        let selector = prediction.selector;

        // 1) Skip generic selectors that are too risky to remove
        if(!selector || CONTENT_CONFIG.SKIP_GENERIC_SELECTORS.includes(selector.toLowerCase())){
          console.warn('[CONTENT] Skipping generic selector:', selector);
          return;
        }

        // 2) Only trust predictions that have a strong heuristic signal:
        //    - keyWordHit: "ad", "sponsor", "promo", "banner", etc. in id/class/text
        //    - isIframe: actual ad iframe or iframe wrapper
        if (CONTENT_CONFIG.REQUIRES_STRONG_SIGNAL) {
          const hasStrongSignal = candidate.keyWordHit || candidate.isIframe;
          if (!hasStrongSignal) {
            console.warn(
              '[CONTENT] Skipping weak-signal element (no keyword/iframe) even though model flagged it:',
              selector,
              `confidence: ${prediction.confidence}%`
            );
            return;
          }
        }
      

        // Safely escape ID selectors (e.g. #3pAd) to avoid querySelector errors
        let safeSelector = selector.startsWith("#") ? "#" + CSS.escape(selector.slice(1)): selector;
        // Try to find and remove the element
        let element = document.querySelector(safeSelector);

        // Fallback: if selector doesn't work, try finding by other attributes
        if (!element && candidate.id) {
            element = document.getElementById(candidate.id);
        }

        if (element) {
          // Show visual feedback if enabled
          if (settings.showVisualFeedback) {
            showVisualFeedback(element, selector);
          }
          
          // Remove element and clean up empty containers
          removeElementAndCleanup(element);
          adsBlocked++;
          console.log(
            `✓ Removed ad (${prediction.confidence}% confidence): ${selector}`
          );
        } else {
          console.warn(`✗ Element not found for selector: ${selector}`);
        }
      }
    });

    console.log(
      `[CONTENT] [${scanId}] ✓ Scan complete: ${adsBlocked} ads blocked out of ${data.total_scanned} elements`
    );
    
    return { adsBlocked, totalScanned: data.total_scanned };
  } catch (error) {
    console.error(`[CONTENT] [${scanId}] ✗ AI ad detection failed:`, error.message);
    console.log(`[CONTENT] [${scanId}] Falling back to keyword-based detection...`);

    // Fallback to simple keyword detection if API fails
    let fallbackBlocked = 0;
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
            if (settings.showVisualFeedback) {
              showVisualFeedback(element, selector);
            }
            removeElementAndCleanup(element);
            fallbackBlocked++;
            console.log(`Removed ad (fallback): ${selector}`);
          }
        }
      }
    });
    
    return { adsBlocked: fallbackBlocked, totalScanned: adCandidates.length };
  }
};

/**
 * Track removed elements to avoid re-processing
 */
const removedElements = new WeakSet();

/**
 * Check if a newly added element might be an ad
 */
async function checkNewElement(element) {
  // Skip if already processed or removed
  if (removedElements.has(element) || !element.parentNode) {
    return;
  }
  
  // Skip if extension is disabled or site is whitelisted
  const settings = await getSettings();
  if (!settings.enabled) return;
  
  const whitelisted = await isWhitelisted();
  if (whitelisted) return;
  
  // Only check elements that match ad-like patterns
  const tagName = element.tagName?.toLowerCase();
  const className = element.className || '';
  const id = element.id || '';
  const isIframe = tagName === 'iframe' || element.querySelector('iframe');
  
  // Quick heuristic check - only process likely ad elements
  const looksLikeAd = 
    isIframe ||
    tagName === 'div' && (
      /ad|banner|sponsor|promo/i.test(className) ||
      /ad|banner|sponsor|promo/i.test(id)
    ) ||
    element.querySelector('[class*="ad"], [id*="ad"]');
  
  if (!looksLikeAd) return;
  
  // Gather candidate data for this element
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const area = width * height;
  
  // Check for keywords
  const keyWords = /\bads?\b|\bsponsor(ed)?\b|\bpromo(tion|ted)?\b|\bgoogle[_-]ads?\b|\bbanner\b/i;
  const findMatch = (str) => {
    if (!str) return null;
    const m = String(str).match(keyWords);
    return m ? m[0] : null;
  };
  
  const idMatch = findMatch(id);
  const classMatch = findMatch(className);
  const textMatch = findMatch((element.innerText || '').slice(0, 100));
  
  let keyWordHit = false, keyWordSource = null;
  if (idMatch) {
    keyWordHit = true;
    keyWordSource = 'id';
  } else if (classMatch) {
    keyWordHit = true;
    keyWordSource = 'class';
  } else if (textMatch) {
    keyWordHit = true;
    keyWordSource = 'text';
  }
  
  const candidate = {
    keyWordHit,
    keyWordSource,
    keyWordMatch: idMatch || classMatch || textMatch,
    isIframe,
    tag: element.tagName,
    id: id,
    classList: className,
    width,
    height,
    area
  };
  
  // Send to AI for prediction
  try {
    const data = await callAIModelViaBackground([candidate]);
    if (data.predictions && data.predictions.length > 0) {
      const prediction = data.predictions[0];
      const threshold = settings.confidenceThreshold || 80;
      
      if (prediction.confidence >= threshold && prediction.isAd) {
        // Check strong signal requirement
        if (CONTENT_CONFIG.REQUIRES_STRONG_SIGNAL) {
          const hasStrongSignal = candidate.keyWordHit || candidate.isIframe;
          if (!hasStrongSignal) return;
        }
        
        // Remove the ad
        if (settings.showVisualFeedback) {
          showVisualFeedback(element, prediction.selector || '');
        }
        removeElementAndCleanup(element);
        removedElements.add(element);
        
        console.log(`[CONTENT] Removed dynamic ad (${prediction.confidence}% confidence)`);
        
        // Update statistics
        chrome.runtime.sendMessage({
          type: 'UPDATE_STATS',
          adsBlocked: 1,
          domain: getCurrentDomain()
        }).catch(() => {});
      }
    }
  } catch (error) {
    // Silently fail for dynamic checks to avoid spam
    console.debug('[CONTENT] Dynamic ad check failed:', error.message);
  }
}

/**
 * Setup MutationObserver to watch for dynamically added ads
 */
let mutationObserver = null;

function setupDynamicAdObserver() {
  // Only setup if not already set up
  if (mutationObserver) return;
  
  mutationObserver = new MutationObserver((mutations) => {
    // Debounce: collect all new elements first
    const newElements = new Set();
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // Only process element nodes
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check the element itself
          newElements.add(node);
          
          // Also check its children (for containers that might wrap ads)
          if (node.querySelectorAll) {
            const children = node.querySelectorAll('iframe, div, aside, [class*="ad"], [id*="ad"]');
            children.forEach(child => {
              if (child.nodeType === Node.ELEMENT_NODE) {
                newElements.add(child);
              }
            });
          }
        }
      });
    });
    
    // Process new elements with a small delay to avoid spam
    if (newElements.size > 0) {
      setTimeout(() => {
        newElements.forEach(element => {
          if (element.parentNode && !removedElements.has(element)) {
            checkNewElement(element).catch(() => {}); // Ignore errors
          }
        });
      }, 100); // Small delay to let content load
    }
  });
  
  // Start observing
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('[CONTENT] Dynamic ad observer started');
}

// Run the ad removal script on page load
window.addEventListener('load', async () => {
  const result = await scanAndRemoveAds();
  // Report statistics
  if (result.adsBlocked > 0) {
    chrome.runtime.sendMessage({
      type: 'UPDATE_STATS',
      adsBlocked: result.adsBlocked,
      domain: getCurrentDomain()
    }).catch(() => {}); // Ignore errors
  }
  
  // Setup dynamic ad observer after initial scan
  setupDynamicAdObserver();
});

// Inject CSS for collapsing empty spaces
injectCollapseCSS();

// Also setup observer when DOM is ready (before load event)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectCollapseCSS();
    setupDynamicAdObserver();
  });
} else {
  setupDynamicAdObserver();
}

// Allow manual ad removal via a Chrome message
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'SCAN_PAGE') {
    console.log('Received SCAN_PAGE message');
    
    // Run async function and handle response
    scanAndRemoveAds(message.settings)
      .then(async (result) => {
        // Report statistics
        if (result.adsBlocked > 0) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_STATS',
            adsBlocked: result.adsBlocked,
            domain: getCurrentDomain()
          }).catch(() => {}); // Ignore errors
        }
        
        sendResponse({ 
          success: true, 
          message: 'AI scan complete',
          adsBlocked: result.adsBlocked,
          totalScanned: result.totalScanned
        });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    
    // Return true to indicate async response
    return true;
  }
});

console.log('Ad Candidates:', gatherAdCandidates(500));