(function () {
  /**
   * Set the status line text in the popup.
   * @param {string} message
   */
  function setStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message || '';
  }

  /**
   * Render an object as pretty JSON into the <pre> result element.
   * @param {unknown} data
   */
  function renderResult(data) {
    const pre = document.getElementById('result');
    if (!pre) return;
    try {
      pre.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      pre.textContent = String(err);
    }
  }

  /**
   * Request a scan from the active tab's content script.
   */
  async function scanActiveTab() {
    const button = document.getElementById('scanBtn');
    try {
      if (button) button.disabled = true;
      setStatus('Scanning...');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active tab found.');
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });

      if (!response) {
        throw new Error('No response from content script.');
      }

      if (response && response.error) {
        setStatus('Error');
        renderResult({ error: response.error });
        return;
      }

      setStatus('Done');
      renderResult(response);
    } catch (error) {
      // Common case: content script not injected on the page yet.
      setStatus('Error');
      renderResult({ error: error && error.message ? error.message : String(error) });
    } finally {
      if (button) button.disabled = false;
    }
  }

  function init() {
    const button = document.getElementById('scanBtn');
    if (button) {
      button.addEventListener('click', scanActiveTab);
    }
    setStatus('Idle');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
