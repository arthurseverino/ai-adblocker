(function () {
  'use strict';

  // State
  let currentSettings = null;
  let currentStats = null;
  let currentTab = null;

  /**
   * Initialize the popup
   */
  async function init() {
    // Load current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    
    // Update current site display
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname.replace('www.', '');
        document.getElementById('currentSite').textContent = `Current site: ${domain}`;
      } catch (e) {
        document.getElementById('currentSite').textContent = '';
      }
    }

    // Load settings and stats
    await loadSettings();
    await loadStatistics();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup tabs
    setupTabs();
    
    // Update UI
    updateUI();
  }

  /**
   * Setup tab switching
   */
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active states
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
        
        // Refresh data when switching to stats tab
        if (targetTab === 'stats') {
          loadStatistics().then(updateStatisticsUI);
        }
      });
    });
  }

  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    // Enable/Disable toggle
    const enableToggle = document.getElementById('enableToggle');
    enableToggle.addEventListener('click', async () => {
      const newState = !currentSettings.enabled;
      await Storage.updateSetting('enabled', newState);
      await loadSettings();
      updateToggleState('enableToggle', newState);
      updateBadge();
    });

    // Visual feedback toggle
    const visualToggle = document.getElementById('visualFeedbackToggle');
    visualToggle.addEventListener('click', async () => {
      const newState = !currentSettings.showVisualFeedback;
      await Storage.updateSetting('showVisualFeedback', newState);
      await loadSettings();
      updateToggleState('visualFeedbackToggle', newState);
    });

    // Confidence slider
    const confidenceSlider = document.getElementById('confidenceSlider');
    confidenceSlider.addEventListener('input', async (e) => {
      const value = parseInt(e.target.value);
      document.getElementById('thresholdValue').textContent = `${value}%`;
      await Storage.updateSetting('confidenceThreshold', value);
      await loadSettings();
    });

    // Scan button
    const scanBtn = document.getElementById('scanBtn');
    scanBtn.addEventListener('click', scanActiveTab);

    // Whitelist input
    const whitelistInput = document.getElementById('whitelistInput');
    whitelistInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const domain = e.target.value.trim().toLowerCase();
        if (domain) {
          await Storage.addToWhitelist(domain);
          await loadSettings();
          updateWhitelistUI();
          e.target.value = '';
        }
      }
    });

    // Reset stats button
    const resetStatsBtn = document.getElementById('resetStatsBtn');
    resetStatsBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all statistics?')) {
        await Storage.resetStatistics();
        await loadStatistics();
        updateStatisticsUI();
        updateBadge();
      }
    });

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.addEventListener('click', exportData);

    // Import button
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importData);
  }

  /**
   * Load settings from storage
   */
  async function loadSettings() {
    currentSettings = await Storage.getSettings();
  }

  /**
   * Load statistics from storage
   */
  async function loadStatistics() {
    currentStats = await Storage.getStatistics();
  }

  /**
   * Update all UI elements
   */
  function updateUI() {
    if (!currentSettings) return;

    // Update toggles
    updateToggleState('enableToggle', currentSettings.enabled);
    updateToggleState('visualFeedbackToggle', currentSettings.showVisualFeedback);

    // Update confidence slider
    const slider = document.getElementById('confidenceSlider');
    slider.value = currentSettings.confidenceThreshold;
    document.getElementById('thresholdValue').textContent = `${currentSettings.confidenceThreshold}%`;

    // Update whitelist
    updateWhitelistUI();

    // Update statistics
    updateStatisticsUI();

    // Update badge
    updateBadge();
  }

  /**
   * Update toggle state
   */
  function updateToggleState(id, active) {
    const toggle = document.getElementById(id);
    if (toggle) {
      toggle.classList.toggle('active', active);
    }
  }

  /**
   * Update whitelist UI
   */
  function updateWhitelistUI() {
    const container = document.getElementById('whitelistItems');
    if (!container || !currentSettings) return;

    container.innerHTML = '';
    
    if (currentSettings.whitelist.length === 0) {
      container.innerHTML = '<div style="font-size: 11px; color: gray; padding: 8px;">No whitelisted sites</div>';
      return;
    }

    currentSettings.whitelist.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'whitelist-item';
      item.innerHTML = `
        <span>${domain}</span>
        <button class="whitelist-remove" data-domain="${domain}">Remove</button>
      `;
      item.querySelector('.whitelist-remove').addEventListener('click', async () => {
        await Storage.removeFromWhitelist(domain);
        await loadSettings();
        updateWhitelistUI();
      });
      container.appendChild(item);
    });
  }

  /**
   * Update statistics UI
   */
  function updateStatisticsUI() {
    if (!currentStats) return;

    document.getElementById('totalAds').textContent = currentStats.totalAdsBlocked.toLocaleString();
    document.getElementById('sessionAds').textContent = currentStats.sessionAdsBlocked.toLocaleString();
    document.getElementById('pagesScanned').textContent = currentStats.totalPagesScanned.toLocaleString();
    
    const avgAds = currentStats.totalPagesScanned > 0 
      ? (currentStats.totalAdsBlocked / currentStats.totalPagesScanned).toFixed(1)
      : '0';
    document.getElementById('avgAds').textContent = avgAds;

    // Per-site stats
    const perSiteContainer = document.getElementById('perSiteStats');
    perSiteContainer.innerHTML = '';

    const sites = Object.entries(currentStats.perSiteStats)
      .sort((a, b) => b[1].adsBlocked - a[1].adsBlocked)
      .slice(0, 10); // Top 10 sites

    if (sites.length === 0) {
      perSiteContainer.innerHTML = '<div style="font-size: 11px; color: gray; padding: 8px;">No site statistics yet</div>';
      return;
    }

    sites.forEach(([domain, stats]) => {
      const item = document.createElement('div');
      item.className = 'site-stat-item';
      item.innerHTML = `
        <span>${domain}</span>
        <span><strong>${stats.adsBlocked}</strong> ads on ${stats.pagesScanned} pages</span>
      `;
      perSiteContainer.appendChild(item);
    });
  }

  /**
   * Update badge counter
   */
  async function updateBadge() {
    const stats = await Storage.getStatistics();
    const count = stats.sessionAdsBlocked;
    
    if (count > 0) {
      chrome.action.setBadgeText({ text: count > 99 ? '99+' : count.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  /**
   * Check backend health status
   */
  async function checkBackendHealth() {
    try {
      const API_URL = "https://ai-adblocker.onrender.com";
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        return { healthy: true, data };
      }
      return { healthy: false, error: `Status: ${response.status}` };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Scan active tab
   */
  async function scanActiveTab() {
    const button = document.getElementById('scanBtn');
    const statusEl = document.getElementById('status');
    
    try {
      if (button) button.disabled = true;
      setStatus('Checking backend...');

      // Check if enabled
      await loadSettings();
      if (!currentSettings.enabled) {
        setStatus('Ad blocking is disabled');
        if (button) button.disabled = false;
        return;
      }

      // Health check
      const health = await checkBackendHealth();
      if (!health.healthy) {
        setStatus('Backend unavailable');
        if (button) button.disabled = false;
        return;
      }

      setStatus('Scanning page...');

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || !tab.id) {
        throw new Error('No active tab found.');
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'SCAN_PAGE',
        settings: currentSettings
      });

      if (!response) {
        throw new Error('No response from content script.');
      }

      if (response && response.error) {
        setStatus('Scan failed');
        return;
      }

      // Update statistics
      if (response.adsBlocked !== undefined) {
        const url = new URL(tab.url);
        const domain = url.hostname.replace('www.', '');
        
        await Storage.updateStatistics({
          totalAdsBlocked: response.adsBlocked,
          totalPagesScanned: 1,
          siteStats: {
            domain: domain,
            adsBlocked: response.adsBlocked,
            pagesScanned: 1
          }
        });
        
        await loadStatistics();
        updateStatisticsUI();
        updateBadge();
      }

      setStatus(`✓ Blocked ${response.adsBlocked || 0} ads`);
    } catch (error) {
      setStatus('Error: ' + (error.message || 'Unknown error'));
    } finally {
      if (button) button.disabled = false;
    }
  }

  /**
   * Set status message
   */
  function setStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message || '';
  }

  /**
   * Export data
   */
  async function exportData() {
    try {
      const data = await Storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-adblocker-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Settings exported successfully');
    } catch (error) {
      setStatus('Export failed: ' + error.message);
    }
  }

  /**
   * Import data
   */
  async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (await Storage.importData(data)) {
        await loadSettings();
        await loadStatistics();
        updateUI();
        setStatus('Settings imported successfully');
      } else {
        setStatus('Import failed');
      }
    } catch (error) {
      setStatus('Import failed: ' + error.message);
    } finally {
      event.target.value = ''; // Reset file input
    }
  }

  // Initialize on load
  document.addEventListener('DOMContentLoaded', init);
})();
