// background.js - MV3 service worker
// Receives adCandidates from content.js and calls the AI backend.
// We do this in the background instead of content.js because content scripts
// run in the webpage context and are blocked by browser security (CORS and 
// Private Network restrictions). Background scripts run in extension context,
// which has permission to directly call localhost and return predictions safely.

//getting message from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PREDICT_ADS"){
        const {adCandidates} = message;

        (async () => {
            const startTime = Date.now();
            try {
                console.log(`[BACKGROUND] Sending ${adCandidates.length} ad candidates to AI backend...`);
                console.log("[BACKGROUND] Backend URL: http://127.0.0.1:5001/predict");

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

                const response = await fetch("http://127.0.0.1:5001/predict", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({adCandidates}),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok){
                    const errorText = await response.text();
                    throw new Error(`Backend Error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                const elapsed = Date.now() - startTime;
                console.log(`[BACKGROUND] AI response received in ${elapsed}ms`);
                console.log(`[BACKGROUND] Detected ${data.ads_detected} ads out of ${data.total_scanned} candidates`);
                console.log("[BACKGROUND] Response data:", data);

                sendResponse({success: true, data});
            }
            catch(err){
                const elapsed = Date.now() - startTime;
                console.error(`[BACKGROUND] ✗ AI request failed after ${elapsed}ms:`, err.message);
                console.error("[BACKGROUND] Error details:", err);
                sendResponse({success: false, error: String(err.message) });
            }
        })();

        return true;
    }
});