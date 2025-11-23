// background.js - MV3 service worker
// Receives adCandidates from content.js and calls the AI backend.
// We do this in the background instead of content.js because content scripts
// run in the webpage context and are blocked by browser security (CORS and 
// Private Network restrictions). Background scripts run in extension context,
// which has permission to directly call localhost and return predictions safely.

//getting message from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PREDICT ADS"){
        const {adCandidates} = message;

        (async () => {
            try {
                console.log("background: sending ad candidates to AI backend");

                const response = await fetch("http://localhost:5000/predict", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({adCandidates}),

                });
                if (!response.ok){
                    throw new Error(`Backend Error: ${response.status}`);
                }

                const data = await response.json();
                console.log("Background: received AI response", data);

                sendResponse({success: true, data});
            }
            catch(err){
                console.error("Background: AI request failed", data);
                sendResponse({success: false, error: String(err) });
            }
        })();

        return true;
    }
});