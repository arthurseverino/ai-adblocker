// background.js - MV3 service worker
// Receives adCandidates from content.js and calls the AI backend.
// We do this in the background instead of content.js because content scripts
// run in the webpage context and are blocked by browser security (CORS and 
// Private Network restrictions). Background scripts run in extension context,
// which has permission to directly call localhost and return predictions safely.

// Import configuration and storage
importScripts('config.js');
importScripts('storage.js');

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make API request with retry logic
 */
async function fetchWithRetry(url, options, maxRetries = CONFIG.MAX_RETRIES) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (error) {
            lastError = error;
            
            // Don't retry on abort (timeout) or if it's the last attempt
            if (error.name === 'AbortError' || attempt === maxRetries) {
                throw error;
            }
            
            // Wait before retrying
            const delay = CONFIG.RETRY_DELAY_MS * (attempt + 1); // Exponential backoff
            console.log(`[BACKGROUND] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
            await sleep(delay);
        }
    }
    
    throw lastError;
}

// Handle all messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle settings requests
    if (message?.type === "GET_SETTINGS") {
        (async () => {
            const settings = await Storage.getSettings();
            sendResponse({ settings });
        })();
        return true;
    }

    // Handle whitelist check
    if (message?.type === "CHECK_WHITELIST") {
        (async () => {
            const whitelisted = await Storage.isWhitelisted(message.domain);
            sendResponse({ whitelisted });
        })();
        return true;
    }

    // Handle statistics updates
    if (message?.type === "UPDATE_STATS") {
        (async () => {
            await Storage.updateStatistics({
                totalAdsBlocked: message.adsBlocked,
                totalPagesScanned: 1,
                siteStats: {
                    domain: message.domain,
                    adsBlocked: message.adsBlocked,
                    pagesScanned: 1
                }
            });
            
            // Update badge
            const stats = await Storage.getStatistics();
            const count = stats.sessionAdsBlocked;
            if (count > 0) {
                chrome.action.setBadgeText({ text: count > 99 ? '99+' : count.toString() });
                chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            }
            
            sendResponse({ success: true });
        })();
        return true;
    }

    // Handle AI prediction requests
    if (message?.type === "PREDICT_ADS"){
        const {adCandidates} = message;

        (async () => {
            const startTime = Date.now();
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            try {
                // Validate input
                if (!adCandidates || !Array.isArray(adCandidates)) {
                    throw new Error('Invalid adCandidates: must be an array');
                }
                
                // Enforce candidate limit to prevent performance issues
                const candidatesToProcess = adCandidates.slice(0, CONFIG.MAX_CANDIDATES);
                if (adCandidates.length > CONFIG.MAX_CANDIDATES) {
                    console.warn(`[BACKGROUND] [${requestId}] Limiting candidates from ${adCandidates.length} to ${CONFIG.MAX_CANDIDATES}`);
                }
                
                console.log(`[BACKGROUND] [${requestId}] Sending ${candidatesToProcess.length} ad candidates to AI backend...`);
                console.log(`[BACKGROUND] [${requestId}] Backend URL: ${CONFIG.API_URL}/predict`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
                
                const response = await fetchWithRetry(
                    `${CONFIG.API_URL}/predict`,
                    {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({adCandidates: candidatesToProcess}),
                        signal: controller.signal
                    }
                );

                clearTimeout(timeoutId);

                if (!response.ok){
                    const errorText = await response.text();
                    throw new Error(`Backend Error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                const elapsed = Date.now() - startTime;
                console.log(`[BACKGROUND] [${requestId}] ✓ AI response received in ${elapsed}ms`);
                console.log(`[BACKGROUND] [${requestId}] Detected ${data.ads_detected} ads out of ${data.total_scanned} candidates`);

                sendResponse({success: true, data});
            }
            catch(err){
                const elapsed = Date.now() - startTime;
                const errorMessage = err.name === 'AbortError' 
                    ? 'Request timeout - backend may be slow or unavailable'
                    : String(err.message);
                    
                console.error(`[BACKGROUND] [${requestId}] ✗ AI request failed after ${elapsed}ms:`, errorMessage);
                
                // Only log full error details in development
                if (CONFIG.API_URL.includes('localhost') || CONFIG.API_URL.includes('127.0.0.1')) {
                    console.error("[BACKGROUND] Error details:", err);
                }
                
                sendResponse({
                    success: false, 
                    error: errorMessage,
                    requestId: requestId
                });
            }
        })();

        return true;
    }
});