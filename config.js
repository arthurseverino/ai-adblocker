/**
 * Centralized configuration for the AI Ad Blocker extension
 * This allows easy switching between local and production environments
 */

const CONFIG = {
  // API Configuration
  API_URL: "https://ai-adblocker.onrender.com",
  // Fallback to localhost for development (uncomment to use local backend)
  // API_URL: "http://127.0.0.1:5001",
  
  // Request Configuration
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  MAX_CANDIDATES: 500, // Maximum number of ad candidates to process per request
  
  // Model Configuration
  CONFIDENCE_THRESHOLD: 80, // Minimum confidence percentage to classify as ad
  
  // Safety Configuration
  SKIP_GENERIC_SELECTORS: ['div', 'section'], // Selectors too generic to safely remove
  REQUIRES_STRONG_SIGNAL: true, // Require keyword/iframe signal before removal
  
  // Retry Configuration
  MAX_RETRIES: 2, // Maximum number of retry attempts for failed requests
  RETRY_DELAY_MS: 1000, // Delay between retries (milliseconds)
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

