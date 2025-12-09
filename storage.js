/**
 * Storage utility for managing extension settings and statistics
 * Uses chrome.storage.local for persistence
 */

const Storage = {
  // Default settings
  DEFAULT_SETTINGS: {
    enabled: true,
    confidenceThreshold: 80,
    whitelist: [],
    showVisualFeedback: true,
    trackStatistics: true
  },

  /**
   * Get all settings
   */
  async getSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      return result.settings || { ...this.DEFAULT_SETTINGS };
    } catch (error) {
      console.error('[STORAGE] Error getting settings:', error);
      return { ...this.DEFAULT_SETTINGS };
    }
  },

  /**
   * Save settings
   */
  async saveSettings(settings) {
    try {
      await chrome.storage.local.set({ settings });
      return true;
    } catch (error) {
      console.error('[STORAGE] Error saving settings:', error);
      return false;
    }
  },

  /**
   * Update a specific setting
   */
  async updateSetting(key, value) {
    const settings = await this.getSettings();
    settings[key] = value;
    return await this.saveSettings(settings);
  },

  /**
   * Get statistics
   */
  async getStatistics() {
    try {
      const result = await chrome.storage.local.get(['statistics']);
      return result.statistics || {
        totalAdsBlocked: 0,
        totalPagesScanned: 0,
        perSiteStats: {},
        sessionAdsBlocked: 0,
        lastResetDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('[STORAGE] Error getting statistics:', error);
      return {
        totalAdsBlocked: 0,
        totalPagesScanned: 0,
        perSiteStats: {},
        sessionAdsBlocked: 0,
        lastResetDate: new Date().toISOString()
      };
    }
  },

  /**
   * Update statistics
   */
  async updateStatistics(updates) {
    const stats = await this.getStatistics();
    
    // Merge updates
    if (updates.totalAdsBlocked !== undefined) {
      stats.totalAdsBlocked += updates.totalAdsBlocked;
      stats.sessionAdsBlocked += updates.totalAdsBlocked;
    }
    if (updates.totalPagesScanned !== undefined) {
      stats.totalPagesScanned += updates.totalPagesScanned;
    }
    if (updates.siteStats) {
      const domain = updates.siteStats.domain;
      if (!stats.perSiteStats[domain]) {
        stats.perSiteStats[domain] = {
          adsBlocked: 0,
          pagesScanned: 0
        };
      }
      if (updates.siteStats.adsBlocked) {
        stats.perSiteStats[domain].adsBlocked += updates.siteStats.adsBlocked;
      }
      if (updates.siteStats.pagesScanned) {
        stats.perSiteStats[domain].pagesScanned += updates.siteStats.pagesScanned;
      }
    }

    try {
      await chrome.storage.local.set({ statistics: stats });
      return stats;
    } catch (error) {
      console.error('[STORAGE] Error updating statistics:', error);
      return stats;
    }
  },

  /**
   * Reset statistics
   */
  async resetStatistics() {
    const defaultStats = {
      totalAdsBlocked: 0,
      totalPagesScanned: 0,
      perSiteStats: {},
      sessionAdsBlocked: 0,
      lastResetDate: new Date().toISOString()
    };
    await chrome.storage.local.set({ statistics: defaultStats });
    return defaultStats;
  },

  /**
   * Add site to whitelist
   */
  async addToWhitelist(domain) {
    const settings = await this.getSettings();
    if (!settings.whitelist.includes(domain)) {
      settings.whitelist.push(domain);
      await this.saveSettings(settings);
    }
    return settings.whitelist;
  },

  /**
   * Remove site from whitelist
   */
  async removeFromWhitelist(domain) {
    const settings = await this.getSettings();
    settings.whitelist = settings.whitelist.filter(d => d !== domain);
    await this.saveSettings(settings);
    return settings.whitelist;
  },

  /**
   * Check if domain is whitelisted
   */
  async isWhitelisted(domain) {
    const settings = await this.getSettings();
    return settings.whitelist.includes(domain);
  },

  /**
   * Export settings and statistics
   */
  async exportData() {
    const settings = await this.getSettings();
    const statistics = await this.getStatistics();
    return {
      settings,
      statistics,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
  },

  /**
   * Import settings and statistics
   */
  async importData(data) {
    try {
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
      if (data.statistics) {
        await chrome.storage.local.set({ statistics: data.statistics });
      }
      return true;
    } catch (error) {
      console.error('[STORAGE] Error importing data:', error);
      return false;
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}

